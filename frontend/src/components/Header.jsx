import logo from "../images/logo.png";

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white shadow flex items-center px-4 z-50">
      <img src={logo} alt="Logo Grupo BIA" className="h-4 w-auto mr-3" />
      <h1 className="text-lg font-semibold text-blue-600">Grupo BIA</h1>
    </header>
  );
}