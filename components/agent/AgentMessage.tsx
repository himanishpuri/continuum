import clsx from "clsx";
import type { AgentRunStep, ConversationMessage } from "@/lib/types";
import { ActionApprovalCard, type ActionCardData } from "./ActionApprovalCard";
import { EvidenceList } from "./EvidenceList";
import { AgentRunTimeline } from "./AgentRunTimeline";

export function AgentMessage({ message, steps }: { message: ConversationMessage; steps?: AgentRunStep[] }) {
  const isUser = message.role === "user";

  return (
    <div className={clsx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line sm:max-w-[75%]",
          isUser
            ? "bg-teal-700 text-white"
            : "border border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        )}
      >
        {!isUser && <p className="mb-1 text-xs font-semibold text-teal-700 dark:text-teal-400">Continuum</p>}
        {message.content}

        {message.cards.map((card, idx) => {
          if (card.kind === "plan_proposal" || card.kind === "action_approval") {
            return <ActionApprovalCard key={idx} data={card.data as unknown as ActionCardData} />;
          }
          if (card.kind === "evidence") {
            return <EvidenceList key={idx} items={(card.data as { items: import("@/lib/types").Evidence[] }).items} />;
          }
          return null;
        })}

        {!isUser && steps && <AgentRunTimeline steps={steps} />}
      </div>
    </div>
  );
}
