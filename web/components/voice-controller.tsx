"use client";

import { useCallback, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useAuth } from "@/lib/use-auth";
import type { BuildingType, OptionKey } from "@/lib/types";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "";

interface VoiceControllerProps {
  onSetOption: (option: OptionKey) => void;
  onSetRooms: (rooms: number) => void;
  onSetType: (type: BuildingType) => void;
  onRunStressTest: () => void;
  explainMemo: () => string;
}

// useConversation requires a ConversationProvider ancestor in this SDK
// version, so the public component is a thin provider wrapper.
export function VoiceController(props: VoiceControllerProps) {
  return (
    <ConversationProvider>
      <VoiceControllerInner {...props} />
    </ConversationProvider>
  );
}

function VoiceControllerInner({
  onSetOption,
  onSetRooms,
  onSetType,
  onRunStressTest,
  explainMemo,
}: VoiceControllerProps) {
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();

  const conversation = useConversation({
    clientTools: {
      set_option: (parameters: { option: string }) => {
        const option = parameters.option.toUpperCase() === "B" ? "B" : "A";
        onSetOption(option);
        return `Option ${option} is now active.`;
      },
      set_rooms: (parameters: { rooms: number }) => {
        const rooms = Math.max(2, Math.min(400, Math.round(parameters.rooms)));
        onSetRooms(rooms);
        return `Room count set to ${rooms}.`;
      },
      set_building_type: (parameters: { building_type: string }) => {
        const raw = parameters.building_type.toLowerCase();
        const type: BuildingType = raw.includes("home")
          ? "homestay"
          : raw.includes("tower") || raw.includes("high")
            ? "tower"
            : "boutique";
        onSetType(type);
        return `Building type set to ${type}.`;
      },
      run_stress_test: () => {
        onRunStressTest();
        return "Running the fully booked heat-wave weekend stress test now.";
      },
      explain_memo: () => explainMemo(),
      export_memo: () => {
        if (auth.enabled && !auth.mfaVerified) {
          auth.startStepUp();
          return "Exporting needs identity verification. I have opened the step-up check; ask me again once you have verified.";
        }
        window.print();
        return "Verified. Exporting the memo now.";
      },
    },
  });

  const start = useCallback(async () => {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({
        agentId: AGENT_ID,
        connectionType: "webrtc",
      });
    } catch {
      setError(
        AGENT_ID
          ? "Could not start the voice session (mic or network)."
          : "Voice agent not provisioned yet.",
      );
    }
  }, [conversation]);

  const stop = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const connected = conversation.status === "connected";

  return (
    <div className="pointer-events-auto fixed bottom-5 right-80 z-40 flex flex-col items-end gap-1.5">
      {error && (
        <p className="rounded bg-ink/90 px-2.5 py-1 text-[11px] text-alert">
          {error}
        </p>
      )}
      {connected && (
        <p className="rounded bg-ink/90 px-2.5 py-1 text-[11px] text-white/80">
          {conversation.isSpeaking ? "Consultant speaking..." : "Listening..."}
        </p>
      )}
      <button
        onClick={connected ? stop : start}
        className={`grid h-13 w-13 place-items-center rounded-full border-2 p-3.5 shadow-lg transition ${
          connected
            ? "border-alert bg-alert/20 text-alert"
            : "border-accent bg-ink text-accent hover:bg-ink-raised"
        }`}
        title={connected ? "End voice session" : "Talk to the consultant"}
      >
        <MicIcon />
      </button>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
