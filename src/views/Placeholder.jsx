export default function Placeholder({ title }) {
  return (
    <div>
      <div className="page-title">{title}</div>
      <p style={{ marginTop: 16, color: '#666' }}>
        This view is scheduled to be ported from <code>legacy/index.html</code>.
      </p>
    </div>
  );
}
