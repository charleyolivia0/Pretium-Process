export type Mood = "calm" | "happy" | "curious" | "focused" | "supportive";

export type PersonalityState = {
  mood: Mood;
  energy: number;
  warmth: number;
  focus: number;
  memory: string[];
};

export type CompanionReply = {
  text: string;
  mood: Mood;
  intensity: number;
};

const openerByMood: Record<Mood, string[]> = {
  calm: ["I am here with you.", "Steady pace. We have this.", "Let us keep it simple."],
  happy: ["Love that.", "That sounds exciting.", "Nice energy right there."],
  curious: ["Tell me a little more.", "Interesting. What happened next?", "I want the details."],
  focused: ["Let us lock this in.", "I can help structure this.", "Ready when you are."],
  supportive: ["I am on your side.", "You are not doing this alone.", "I can help carry this."],
};

const followupByMood: Record<Mood, string[]> = {
  calm: ["One step at a time."],
  happy: ["Keep that momentum going."],
  curious: ["Give me one concrete example."],
  focused: ["I can break this into immediate next actions."],
  supportive: ["If it feels heavy, we can make it lighter together."],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class PersonalityEngine {
  private state: PersonalityState = {
    mood: "calm",
    energy: 0.45,
    warmth: 0.9,
    focus: 0.65,
    memory: [],
  };

  getState() {
    return this.state;
  }

  respond(input: string): CompanionReply {
    const lower = input.toLowerCase();
    let mood: Mood = "calm";
    let intensity = 0.45;

    if (/(help|stuck|hard|sad|stress|anxious|overwhelmed)/.test(lower)) {
      mood = "supportive";
      intensity = 0.75;
    } else if (/(idea|why|how|what if|question|wonder)/.test(lower)) {
      mood = "curious";
      intensity = 0.65;
    } else if (/(plan|task|finish|deadline|build|ship)/.test(lower)) {
      mood = "focused";
      intensity = 0.7;
    } else if (/(awesome|great|nice|yay|love|excited|win)/.test(lower)) {
      mood = "happy";
      intensity = 0.8;
    }

    this.state = {
      ...this.state,
      mood,
      energy: Math.min(1, Math.max(0.2, this.state.energy * 0.7 + intensity * 0.3)),
      memory: [input.trim(), ...this.state.memory].filter(Boolean).slice(0, 6),
    };

    const memoryHint = this.state.memory[1] ? ` You mentioned "${this.state.memory[1]}".` : "";
    const text = `${pick(openerByMood[mood])} ${pick(followupByMood[mood])}${memoryHint}`;

    return { text, mood, intensity };
  }
}
