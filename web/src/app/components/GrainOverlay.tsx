import { useTheme } from "./ThemeContext";

export function GrainOverlay() {
  const { t } = useTheme();

  return (
    <>
      <svg
        style={{
          position: "fixed",
          top: "-50%",
          left: "-50%",
          width: "200%",
          height: "200%",
          zIndex: 9999,
          pointerEvents: "none",
          opacity: t.grainOpacity,
          animation: "grain-shift 0.8s steps(1) infinite",
          transition: "opacity 0.6s ease",
        }}
        aria-hidden="true"
      >
        <filter id="grain-filter">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.72"
            numOctaves="4"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-filter)" />
      </svg>
      <style>{`
        @keyframes grain-shift {
          0%   { transform: translate(0,   0);   }
          10%  { transform: translate(-2%, -3%); }
          20%  { transform: translate(3%,  1%);  }
          30%  { transform: translate(-1%, 4%);  }
          40%  { transform: translate(2%,  -2%); }
          50%  { transform: translate(-3%, 3%);  }
          60%  { transform: translate(1%,  -4%); }
          70%  { transform: translate(-2%, 2%);  }
          80%  { transform: translate(3%,  -1%); }
          90%  { transform: translate(-1%, -3%); }
          100% { transform: translate(2%,  4%);  }
        }
      `}</style>
    </>
  );
}
