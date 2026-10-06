import { useState } from "react";

type Message = { from: "you" | "her"; text: string };

type Props = {
  onUserMessage: (text: string) => string;
};

export function CompanionChat({ onUserMessage }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { from: "her", text: "Hey, I am Maya. I will stay with you while you work." },
  ]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const reply = onUserMessage(text);
    setMessages((prev) => [...prev, { from: "you", text }, { from: "her", text: reply }]);
    setInput("");
  };

  return (
    <div className="companion-chat no-drag">
      <div className="companion-chat-log">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from}`}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="companion-chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Message your companion..."
        />
        <button type="button" onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
