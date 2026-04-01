import { Badge } from "~/components/ui/badge";
import {
  addEditionsForWorkToShelfServerFn,
  removeWorkEditionsFromShelfServerFn,
} from "~/lib/server-fns/shelves";

interface ShelfMembershipProps {
  workId: string;
  shelves: { id: string; name: string; isMember: boolean }[];
  onToggled: () => void;
}

export function ShelfMembership({ workId, shelves, onToggled }: ShelfMembershipProps) {
  const handleToggle = async (shelfId: string, isMember: boolean) => {
    if (isMember) {
      await removeWorkEditionsFromShelfServerFn({ data: { shelfId, workId } });
    } else {
      await addEditionsForWorkToShelfServerFn({ data: { shelfId, workId } });
    }
    onToggled();
  };

  if (shelves.length === 0) {
    return <span className="text-muted-foreground">No shelves created yet</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="shelf-membership">
      {shelves.map((shelf) => (
        <Badge
          key={shelf.id}
          variant={shelf.isMember ? "default" : "outline"}
          className="cursor-pointer select-none"
          onClick={() => { void handleToggle(shelf.id, shelf.isMember); }}
          data-testid={`shelf-toggle-${shelf.id}`}
        >
          {shelf.name}
        </Badge>
      ))}
    </div>
  );
}
