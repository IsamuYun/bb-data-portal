import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Construction } from "lucide-react";

export function Placeholder({ milestone, items }: { milestone: string; items: string[] }) {
  return (
    <Alert>
      <Construction />
      <AlertTitle>此页面将在 {milestone} 实现</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
