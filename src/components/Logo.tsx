export function Logo({ size = 40 }: { size?: number }) {
  return <img src="/mindcanvas-icon.png" width={size} height={size} alt="MoonCanvas" className="rounded-[22%] object-cover" />;
}
