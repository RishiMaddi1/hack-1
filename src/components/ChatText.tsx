"use client";

export function ChatText({ text, incoming }: { text: string; incoming?: boolean }) {
  const chunks = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <p
      className={`inline-block max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm leading-relaxed ${
        incoming ? "bg-fg text-bg" : "bg-bg"
      }`}
    >
      {chunks.map((chunk, i) =>
        chunk.startsWith("**") && chunk.endsWith("**") ? (
          <strong key={i} className="font-medium">
            {chunk.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{chunk}</span>
        ),
      )}
    </p>
  );
}
