import { useState, useRef, useEffect } from "react";
import { FaPlay, FaPause } from "react-icons/fa";

const AudioPlayer = ({ src, isMyMessage = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
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
    const updateDuration = () => setDuration(audio.duration);
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
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const visibleBars = Math.floor(waveform.length * progress);

  return (
    <div className="flex items-center gap-3">
      {/* Large Circular Play Button */}
      <button
        onClick={togglePlay}
        className={`flex-shrink-0 size-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ${
          isMyMessage
            ? "bg-primary-content/25 hover:bg-primary-content/35"
            : "bg-primary hover:bg-primary/90"
        }`}
      >
        {isPlaying ? (
          <FaPause className={`size-5 ${isMyMessage ? "text-primary-content" : "text-white"}`} />
        ) : (
          <FaPlay
            className={`size-5 ml-0.5 ${isMyMessage ? "text-primary-content" : "text-white"}`}
          />
        )}
      </button>

      {/* Waveform Visualization */}
      <div className="flex-1 flex items-center gap-0.5 h-8 relative">
        {/* Dashed line background */}
        <div
          className={`absolute inset-0 flex items-center ${
            isMyMessage ? "border-t border-dashed border-primary-content/20" : "border-t border-dashed border-base-content/20"
          }`}
        />
        
        {/* Waveform bars */}
        <div className="flex items-end gap-0.5 h-full w-full">
          {waveform.map((height, index) => {
            const barHeight = height * 100;
            const isActive = index < visibleBars;
            
            return (
              <div
                key={index}
                className={`flex-1 rounded-sm transition-all duration-150 ${
                  isActive
                    ? isMyMessage
                      ? "bg-primary-content/90"
                      : "bg-primary"
                    : isMyMessage
                    ? "bg-primary-content/30"
                    : "bg-base-content/30"
                }`}
                style={{
                  height: `${barHeight}%`,
                  minHeight: "2px",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Timestamp */}
      <div
        className={`flex-shrink-0 text-xs font-medium ${
          isMyMessage ? "text-primary-content/80" : "text-base-content/60"
        }`}
      >
        {formatTime(currentTime)}
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
};

export default AudioPlayer;

