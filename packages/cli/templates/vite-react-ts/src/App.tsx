import Welcome from "./components/Welcome.collie";

export default function App() {
  return (
    <div style={{ width: "min(480px, 100%)" }}>
      <Welcome name="Friend" />
    </div>
  );
}
