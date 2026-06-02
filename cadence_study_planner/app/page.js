export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Cadence Study Planner & Telemetry Backend Initialized</h1>
      <p>Data orchestration layer active. Status: 🟢 Operational</p>
      <ul>
        <li>Timetable Engine: <code>/api/timetable/current</code></li>
        <li>OpenAlex Research: <code>/api/scholar/search?q=test</code></li>
      </ul>
    </main>
  );
}