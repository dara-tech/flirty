import { useState, useRef, useEffect } from "react";
import { FaPlay, FaPause } from "react-icons/fa";

const AudioPlayer = ({ src, isMyMessage = false, onPlay, messageId }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasListened, setHasListened] = useState(false);
  const audioRef = useRef(null);

  // Generate waveform bars (simulated - in production, you'd analyze the audio file)
  const generateWaveform = (count = 50) => {
    return Array.from({ length: count }, () => Math.random() * 0.4 + 0.3);
  };

  const [waveform] = useState(() => generateWaveform(50));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      // Only set duration if it's a valid finite number
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
      // Mark as listened when starting to play (only once)
      if (!hasListened && onPlay && messageId) {
        setHasListened(true);
        onPlay(messageId);
      }
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const visibleBars = Math.floor(waveform.length * progress);

  return (
    <div className="flex items-center gap-3.5">
      {/* Professional Circular Play Button */}
      <button
        onClick={togglePlay}
        className={`flex-shrink-0 size-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-md ${
          isMyMessage
            ? "bg-primary-content/20 hover:bg-primary-content/30 backdrop-blur-sm border border-primary-content/10"
            : "bg-primary hover:bg-primary/90 shadow-primary/20"
        }`}
      >
        {isPlaying ? (
          <FaPause className={`w-5 h-5 ${isMyMessage ? "text-primary-content" : "text-white"}`} />
        ) : (
          <FaPlay
            className={`w-5 h-5 ml-0.5 ${isMyMessage ? "text-primary-content" : "text-white"}`}
          />
        )}
      </button>

      {/* Enhanced Waveform Visualization */}
      <div className="flex-1 flex items-center gap-1 h-9 relative min-w-0">
        {/* Subtle dashed line background */}
        <div
          className={`absolute inset-0 flex items-center ${
            isMyMessage ? "border-t border-dashed border-primary-content/15" : "border-t border-dashed border-base-content/15"
          }`}
        />
        
        {/* Professional waveform bars */}
        <div className="flex items-end gap-0.5 h-full w-full px-0.5">
          {waveform.map((height, index) => {
            const barHeight = height * 100;
            const isActive = index < visibleBars;
            
            return (
              <div
                key={index}
                className={`w-0.5 rounded-full transition-all duration-200 ${
                  isActive
                    ? isMyMessage
                      ? "bg-primary-content/95 shadow-sm"
                      : "bg-primary shadow-sm shadow-primary/30"
                    : isMyMessage
                    ? "bg-primary-content/25"
                    : "bg-base-content/25"
                }`}
                style={{
                  height: `${Math.max(barHeight, 8)}%`,
                  minHeight: "3px",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Professional Timestamp */}
      <div
        className={`flex-shrink-0 text-xs font-semibold tabular-nums ${
          isMyMessage ? "text-primary-content/85" : "text-base-content/65"
        }`}
      >
        {isPlaying 
          ? formatTime(currentTime) 
          : formatTime(duration && isFinite(duration) ? duration : currentTime)
        }
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
};

export default AudioPlayer;

