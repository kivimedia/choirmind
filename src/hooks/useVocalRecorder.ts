'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export interface VocalRecorderState {
  isRecording: boolean
  isPaused: boolean
  durationMs: number
  analyserData: Uint8Array | null
  audioBlob: Blob | null
  error: string | null
}

export interface VocalRecorderActions {
  startRecording: () => Promise<void>
  stopRecording: () => void
  pauseRecording: () => void
  resumeRecording: () => void
  reset: () => void
}

export function useVocalRecorder(): VocalRecorderState & VocalRecorderActions {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [analyserData, setAnalyserData] = useState<Uint8Array | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const animFrameRef = useRef<number>(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close()
      }
    }
  }, [])

  const updateAnalyser = useCallback(() => {
    if (!analyserRef.current) return
    const data = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteTimeDomainData(data)
    setAnalyserData(new Uint8Array(data))
    animFrameRef.current = requestAnimationFrame(updateAnalyser)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setAudioBlob(null)
      chunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // Set up AudioContext + AnalyserNode for waveform
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      // Determine best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop())
        if (audioContextRef.current?.state !== 'closed') {
          audioContextRef.current?.close()
        }
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      }

      recorder.start(250) // Collect data every 250ms
      startTimeRef.current = Date.now()
      setIsRecording(true)
      setIsPaused(false)

      // Duration timer
      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current)
      }, 100)

      // Start analyser animation
      updateAnalyser()
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'יש לאשר גישה למיקרופון כדי להקליט'
          : 'שגיאה בהפעלת ההקלטה'
      setError(message)
    }
  }, [updateAnalyser])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRecording(false)
    setIsPaused(false)
  }, [])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
    }
  }, [])

  const reset = useCallback(() => {
    setAudioBlob(null)
    setDurationMs(0)
    setError(null)
    setAnalyserData(null)
    chunksRef.current = []
  }, [])

  return {
    isRecording,
    isPaused,
    durationMs,
    analyserData,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
  }
}
