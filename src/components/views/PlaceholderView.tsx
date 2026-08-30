export default function PlaceholderView({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ maxWidth: 620, margin: "60px auto", textAlign: "center" }}>
      <div className="sec-title" style={{ margin: "0 0 10px" }}>
        {title}
      </div>
      <div className="note info" style={{ display: "inline-flex" }}>
        <span>{note}</span>
      </div>
    </div>
  );
}
