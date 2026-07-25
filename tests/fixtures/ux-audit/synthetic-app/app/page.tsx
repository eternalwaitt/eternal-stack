export default function HomePage() {
  return (
    <main className="p-[13px] bg-gradient-to-r from-purple-500 to-indigo-600">
      <h1 className="text-[17px]">Synthetic landing headline</h1>
      <img src="/hero.png" />
      <div onClick={() => console.log("cta")}>Get started</div>
    </main>
  );
}
