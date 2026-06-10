import { useEffect, useMemo, useRef, useState } from 'react'
import {
  finalizeAfkWin,
  markPlayerOnline,
  markPlayerReconnecting,
} from '../services/roomService.js'

const HEARTBEAT_INTERVAL_MS = 25000

function getDeadlineMillis(deadline) {
  return typeof deadline?.toMillis === 'function'
    ? deadline.toMillis()
    : 0
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

function RoomPresence({
  roomCode,
  room,
  currentUser,
  matchOver = false,
}) {
  const [now, setNow] = useState(0)
  const finalizingRef = useRef(false)
  const opponentUid =
    room?.hostUid === currentUser?.uid ? room?.guestUid : room?.hostUid
  const opponentPresence = opponentUid
    ? room?.presence?.[opponentUid]
    : null
  const reconnectDeadlineMillis = getDeadlineMillis(
    opponentPresence?.reconnectDeadline,
  )
  const opponentReconnecting =
    !matchOver &&
    room?.players?.[opponentUid]?.active !== false &&
    opponentPresence?.status === 'reconnecting' &&
    reconnectDeadlineMillis > 0
  const remainingMilliseconds = reconnectDeadlineMillis - now

  useEffect(() => {
    if (!roomCode || !currentUser?.uid || matchOver) {
      return undefined
    }

    const setOnline = () => {
      markPlayerOnline({
        roomCode,
        playerUid: currentUser.uid,
      }).catch(() => {})
    }
    const setReconnecting = () => {
      markPlayerReconnecting({
        roomCode,
        playerUid: currentUser.uid,
      }).catch(() => {})
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setReconnecting()
      } else {
        setOnline()
      }
    }

    setOnline()
    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setOnline()
      }
    }, HEARTBEAT_INTERVAL_MS)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', setReconnecting)
    window.addEventListener('beforeunload', setReconnecting)

    return () => {
      window.clearInterval(heartbeatId)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
      window.removeEventListener('pagehide', setReconnecting)
      window.removeEventListener('beforeunload', setReconnecting)
    }
  }, [currentUser?.uid, matchOver, roomCode])

  useEffect(() => {
    if (!opponentReconnecting) {
      return undefined
    }

    const initialTickId = window.setTimeout(() => {
      setNow(Date.now())
    }, 0)
    const countdownId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearTimeout(initialTickId)
      window.clearInterval(countdownId)
    }
  }, [opponentReconnecting])

  useEffect(() => {
    if (
      !opponentReconnecting ||
      remainingMilliseconds > 0 ||
      finalizingRef.current ||
      !opponentUid
    ) {
      return
    }

    finalizingRef.current = true
    finalizeAfkWin({
      roomCode,
      winnerUid: currentUser.uid,
      afkPlayerUid: opponentUid,
    })
      .catch(() => {})
      .finally(() => {
        finalizingRef.current = false
      })
  }, [
    currentUser.uid,
    opponentReconnecting,
    opponentUid,
    remainingMilliseconds,
    roomCode,
  ])

  const countdown = useMemo(
    () =>
      now === 0
        ? '2:00'
        : formatCountdown(remainingMilliseconds),
    [now, remainingMilliseconds],
  )

  if (!opponentReconnecting) {
    return null
  }

  return (
    <section className="presence-alert" aria-live="polite">
      <strong>Opponent reconnecting...</strong>
      <span>Opponent has {countdown} to reconnect.</span>
    </section>
  )
}

export default RoomPresence
