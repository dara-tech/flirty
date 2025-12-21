import { FaStop } from "react-icons/fa";

const RecordingIndicator = ({ recordingDuration, onStop }) => {
  return (
    <div className="mb-3 flex items-center gap-3 px-4 py-3 bg-error/10 border border-error/30 rounded-xl">
      <div className="flex items-center gap-2 flex-1">
        <div className="size-3 bg-error rounded-full animate-pulse"></div>
        <span className="text-sm font-medium text-error">
          Recording... {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
        </span>
      </div>
      <button
        type="button"
        className="size-8 rounded-full bg-error text-error-content hover:bg-error/90 flex items-center justify-center transition-all"
        onClick={onStop}
        title="Stop recording"
      >
        <FaStop className="size-3.5" />
      </button>
    </div>
  );
};

export default RecordingIndicator;

