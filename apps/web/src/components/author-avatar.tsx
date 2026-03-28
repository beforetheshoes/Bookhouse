import { useState } from "react";
import { Users } from "lucide-react";

interface AuthorAvatarProps {
  id: string;
  imagePath: string | null;
  size?: "thumb" | "medium";
  className?: string;
  cacheVersion?: number;
}

export function AuthorAvatar({ id, imagePath, size = "thumb", className = "size-10", cacheVersion }: AuthorAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imagePath || imgFailed) {
    return (
      <div className={`flex shrink-0 items-center justify-center rounded-full bg-muted ${className}`}>
        <Users className="size-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={`/api/authors/${id}/${size}${cacheVersion ? `?v=${String(cacheVersion)}` : ""}`}
      alt=""
      loading="lazy"
      className={`shrink-0 rounded-full object-cover ${className}`}
      onError={() => { setImgFailed(true); }}
    />
  );
}
