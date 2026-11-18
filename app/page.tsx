export default function HomePage() {
  return (
    <iframe
      title="Infinity"
      src="/infinity.html"
      aria-label="Infinity application"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100dvh",
        border: 0,
        display: "block",
        background: "#000",
      }}
    />
  );
}
