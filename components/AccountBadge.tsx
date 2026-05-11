import Image from "next/image";

interface Props {
  handle: string | null;
  displayName: string | null;
  profilePicUrl: string | null;
  color: string;
  size?: number;
}

// Small profile pic + tag showing which coach account a thread belongs to.
export default function AccountBadge({
  handle,
  displayName,
  profilePicUrl,
  color,
  size = 16,
}: Props) {
  const initial = (handle ?? displayName ?? "?").charAt(0).toUpperCase();
  return (
    <span
      title={handle ? `@${handle}` : displayName ?? "Account"}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
      style={{ backgroundColor: `${color}26`, color }}
    >
      {profilePicUrl ? (
        <Image
          src={profilePicUrl}
          alt=""
          width={size}
          height={size}
          className="rounded-full"
          unoptimized
        />
      ) : (
        <span
          className="rounded-full inline-flex items-center justify-center"
          style={{
            width: size,
            height: size,
            backgroundColor: color,
            color: "white",
            fontSize: size * 0.55,
          }}
        >
          {initial}
        </span>
      )}
      {handle ? `@${handle}` : displayName}
    </span>
  );
}
