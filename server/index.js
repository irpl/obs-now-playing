import express from 'express';
// import { Server } from 'ws';
import { WebSocketServer } from 'ws';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3123;

// Serve static files from the Next.js build directory
app.use('/_next/static', express.static(path.join(__dirname, '../client/.next/static')));
app.use('/static', express.static(path.join(__dirname, '../client/public')));

// WebSocket server
// const wss = new Server({ noServer: true });
const wss = new WebSocketServer({ noServer: true });

// Spotify API credentials (set these in your .env file)
let accessToken = "";
let refreshToken = "";
let authorization_code = "";
const baseUrl =  process.env.BASE_URL;
const redirectUri = process.env.BASE_URL + process.env.REDIRECT_URI;
const clientId = process.env.SPOTIFY_CLIENT_ID;
const scopes = "user-read-currently-playing user-read-playback-state";
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

app.get('/login', (req, res) => {
  const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
  res.redirect(authUrl);
});

app.get('/callback', (req, res) => {
  const code = req.query.code; // The code will be in the query parameter

  if (code) {
    console.log("Got Authorization Code");
    authorization_code = code;
    // Now you can exchange the code for an access token (next step)
    res.send('Authorization successful! You can close this page.');
  } else {
    res.send('Authorization failed.');
  }
});

// Refresh token function
/**
 * curl -X POST "https://accounts.spotify.com/api/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=refresh_token" \
     -d "refresh_token=YOUR_REFRESH_TOKEN" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET"
 */
async function refreshAccessToken() {
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log('Access token refreshed');
        accessToken = response.data.access_token;
    } catch (error) {
        console.error('Error refreshing token:', error.response?.data || error.message);
        console.log("Attempting to log in")
        await getAccessToken();
    }
}

async function getAccessToken() {
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
      grant_type: 'authorization_code',
      code:authorization_code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log('Access token acquired');
    console.log("Setting access token")
    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;
  } catch (error) {
    console.error('Error getting token:', error.response?.data || error.message);
  }
}


// Fetch Now Playing data
async function fetchNowPlaying() {
    try {
        const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (response.status === 200 && response.data) {
            return {
                track: response.data.item.name,
                artist: response.data.item.artists.map(a => a.name).join(', '),
                album: response.data.item.album.name,
                artwork: response.data.item.album.images[0].url,
                duration: response.data.item.duration_ms,
                progress: response.data.progress_ms,
                isPlaying: response.data.is_playing
            };
        }
    } catch (error) {
        if (error.response?.status === 400) {
            await refreshAccessToken();
        }
        console.error('Error fetching now playing:', error.response?.data || error.message);
    }
    return null;
}

// WebSocket connections
wss.on('connection', (ws) => {
    console.log('Client connected');
    // ws.send(JSON.stringify({ message: 'Connected to Spotify WebSocket' }));
});

// Periodic update
setInterval(async () => {
    if (!authorization_code) {
      return;
    }

    if (!accessToken) {
      await getAccessToken();
    }

    const nowPlaying = await fetchNowPlaying();
    if (nowPlaying) {
      // console.log("Now playing:", nowPlaying);
        wss.clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(JSON.stringify(nowPlaying));
            }
        });
    }
}, 1000);

// Catch-all route for Next.js client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/.next/server/app/index.html'));
});

// Upgrade HTTP server to WebSocket
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`)

  if (!authorization_code) {
    console.log("No user signed in. Please navigate to the following address in your browswer:")
    console.log(`${baseUrl}/login`)
  }
});
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    });
});