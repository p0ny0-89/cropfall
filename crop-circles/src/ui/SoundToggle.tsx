import { useStore } from "../store";
import { setSoundEnabled } from "../audio";

function SpeakerOn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16.5 8.5a4 4 0 0 1 0 7M18.8 6.2a7 7 0 0 1 0 11.6" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Floating mute/unmute for the procedural night ambience. The click is the
// user gesture that lets the AudioContext start.
export default function SoundToggle() {
  const sound = useStore((s) => s.sound);
  const theme = useStore((s) => s.theme);
  const toggleSound = useStore((s) => s.toggleSound);

  const onClick = () => {
    const next = !sound;
    setSoundEnabled(next);
    toggleSound();
  };

  return (
    <button
      className={"sound-toggle" + (theme === "night" ? " night" : "") + (sound ? " on" : "")}
      onClick={onClick}
      aria-label={sound ? "Mute ambience" : "Play night ambience"}
      title={sound ? "Mute ambience" : "Play night ambience"}
    >
      {sound ? <SpeakerOn /> : <SpeakerOff />}
    </button>
  );
}
