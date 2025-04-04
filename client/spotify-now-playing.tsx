"use client"

import { useEffect, useState, useRef } from "react"
import { Music, Pause, Play } from "lucide-react"

import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"

interface SpotifyTrack {
  // id: string
  track: string
  artist: string
  album: string
  artwork: string
  duration: number
  progress: number
  isPlaying: boolean
}

export default function SpotifyNowPlaying() {
  const [track, setTrack] = useState<SpotifyTrack | null>(null)
  const [progressValue, setProgressValue] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected")
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Connect to WebSocket server
    // Replace 'ws://your-websocket-server-url' with your actual WebSocket server URL
    const ws = new WebSocket(`ws://${window.location.host}`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("Connected to WebSocket server")
      setConnectionStatus("connected")
    }

    ws.onmessage = (event) => {
      try {
        // Parse the incoming WebSocket message
        const data = JSON.parse(event.data)
        // console.log("Received Spotify data:", data)

        // Update track state with the received data
        setTrack(data)

        // Calculate progress percentage
        if (data.duration) {
          setProgressValue((data.progress / data.duration) * 100)
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error)
      }
    }

    ws.onerror = (error) => {
      console.error("WebSocket error:", error)
      setConnectionStatus("disconnected")
    }

    ws.onclose = () => {
      console.log("Disconnected from WebSocket server")
      setConnectionStatus("disconnected")
    }

    // Clean up WebSocket connection when component unmounts
    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
  }, [])

  useEffect(() => {
    if (track && track.isPlaying) {
      // Update progress in real-time if track is playing
      const timer = setInterval(() => {
        setProgressValue((prev) => {
          const newValue = prev + (100 / track.duration) * 0.1
          return newValue > 100 ? 100 : newValue
        })
      }, 100)

      return () => clearInterval(timer)
    }
  }, [track])

  if (!track) {
    return (
      <div className="flex h-24 w-full max-w-md items-center justify-center rounded-lg bg-black/60 p-4 backdrop-blur-md">
        <div className="flex items-center gap-2 text-white">
          <Music className={cn("h-5 w-5", connectionStatus === "connecting" ? "animate-pulse" : "")} />
          <span>
            {connectionStatus === "connected"
              ? "Waiting for Spotify data..."
              : connectionStatus === "connecting"
                ? "Connecting to server..."
                : "Disconnected from server"}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-md flex-col rounded-lg bg-black/60 p-4 text-white backdrop-blur-md">
      <div className="flex items-center gap-4">
        {/* Album Art */}
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
          <img
            src={track.artwork || "/placeholder.svg"}
            alt={`${track.album} cover`}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            {track.isPlaying ? <Pause className="h-6 w-6 text-white/80" /> : <Play className="h-6 w-6 text-white/80" />}
          </div>
        </div>

        {/* Track Info */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium", track.isPlaying ? "text-green-400" : "text-white/60")}>
              {track.isPlaying ? "NOW PLAYING" : "PAUSED"}
            </span>
          </div>
          <h3 className="truncate text-base font-bold">{track.track}</h3>
          <p className="truncate text-sm text-white/80">{track.artist}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 space-y-1">
        <Progress value={progressValue} className="h-1 w-full bg-white/20" indicatorClassName="bg-green-400" />
        <div className="flex justify-between text-xs text-white/60">
          <span>{formatTime(track.progress/1000)}</span>
          <span>{formatTime(track.duration/1000)}</span>
        </div>
      </div>
    </div>
  )
}

// Helper function to format seconds as mm:ss
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

