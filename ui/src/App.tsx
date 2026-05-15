import Chat from "./components/Chat";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-6 tracking-tight">Gravity</h1>
      <Chat />
    </div>
  );
}
