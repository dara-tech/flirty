import { useState, useRef, useEffect } from "react";

const Tooltip = ({ children, text, position = "top" }) => {
  const [isVisible, setIsVisible] = useState(false);
  const wrapperRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (isVisible && wrapperRef.current && tooltipRef.current) {
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      let top = 0;
      let left = 0;

      switch (position) {
        case "top":
          top = -tooltipRect.height - 8;
          left = (wrapperRect.width - tooltipRect.width) / 2;
          break;
        case "bottom":
          top = wrapperRect.height + 8;
          left = (wrapperRect.width - tooltipRect.width) / 2;
          break;
        case "left":
          top = (wrapperRect.height - tooltipRect.height) / 2;
          left = -tooltipRect.width - 8;
          break;
        case "right":
          top = (wrapperRect.height - tooltipRect.height) / 2;
          left = wrapperRect.width + 8;
          break;
        default:
          top = -tooltipRect.height - 8;
          left = (wrapperRect.width - tooltipRect.width) / 2;
      }

      tooltipRef.current.style.top = `${top}px`;
      tooltipRef.current.style.left = `${left}px`;
    }
  }, [isVisible, position]);

  return (
    <div
      ref={wrapperRef}
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && text && (
        <div
          ref={tooltipRef}
          className="absolute z-50 pointer-events-none"
        >
          <div className="bg-base-300 text-base-content text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg border border-base-200 whitespace-nowrap">
            {text}
            <div
              className={`absolute w-0 h-0 border-4 border-transparent ${
                position === "top"
                  ? "top-full left-1/2 -translate-x-1/2 border-t-base-300"
                  : position === "bottom"
                  ? "bottom-full left-1/2 -translate-x-1/2 border-b-base-300"
                  : position === "left"
                  ? "left-full top-1/2 -translate-y-1/2 border-l-base-300"
                  : "right-full top-1/2 -translate-y-1/2 border-r-base-300"
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Tooltip;

