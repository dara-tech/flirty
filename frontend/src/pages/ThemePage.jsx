import { useState } from "react";
import { useThemeStore } from "../store/useThemeStore";
import { useNavigate } from "react-router-dom";
import { THEMES } from "../constants";
import { FaAngleLeft } from "react-icons/fa";

const ThemePage = () => {
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col overflow-hidden bg-base-100">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-base-200/50 bg-base-100 px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/?view=settings")}
            className="lg:hidden flex items-center justify-center size-8 sm:size-9 rounded-lg hover:bg-base-200 active:scale-95 transition-all duration-200 text-base-content/70 hover:text-base-content"
            aria-label="Back to settings"
          >
            <FaAngleLeft className="size-4 sm:size-5" />
          </button>
          <div className="flex-1">
        <h1 className="text-xl font-bold text-base-content">Theme</h1>
        <p className="text-sm text-base-content/60 mt-1">Choose your preferred theme</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {THEMES.map((themeOption) => (
            <button
              key={themeOption}
              onClick={() => setTheme(themeOption)}
              className={`
                group relative flex flex-col items-center gap-2 p-3 rounded-xl
                transition-all duration-200
                ${
                  theme === themeOption
                    ? "bg-primary/10 border-2 border-primary shadow-lg ring-2 ring-primary/30 scale-[1.02]"
                    : "bg-base-200 border-2 border-base-300 hover:border-primary/50 hover:bg-base-300 hover:shadow-md"
                }
              `}
              title={themeOption}
            >
              {/* Color Preview Swatch */}
              <div
                data-theme={themeOption}
                className="w-full aspect-square rounded-lg overflow-hidden border-2 border-base-300 shadow-sm"
              >
                <div className="h-full flex flex-col">
                  {/* Primary Color */}
                  <div className="flex-1 bg-primary"></div>
                  {/* Secondary Colors */}
                  <div className="flex h-1/3">
                    <div className="flex-1 bg-secondary"></div>
                    <div className="flex-1 bg-accent"></div>
                    <div className="flex-1 bg-base-200"></div>
                  </div>
                </div>
              </div>
              
              {/* Theme Name */}
              <span
                className={`
                  text-sm font-medium capitalize truncate w-full text-center
                  ${
                    theme === themeOption
                      ? "text-primary font-semibold"
                      : "text-base-content"
                  }
                `}
              >
                {themeOption}
              </span>
              
              {/* Selected Indicator */}
              {theme === themeOption && (
                <div className="absolute -top-1 -right-1 size-6 bg-primary rounded-full border-2 border-base-100 flex items-center justify-center">
                  <svg
                    className="size-3 text-primary-content"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ThemePage;

