import React, { useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OverviewSection, type ActiveTab } from './components/OverviewSection';
import { TeeTimesView } from './components/TeeTimesView';
import { AcademyView } from './components/AcademyView';
import { FleetView } from './components/FleetView';
import { PlayersAndReceptionView } from './components/PlayersAndReceptionView';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { Course } from './types/golf';

const AppShell: React.FC = () => {
  const {
    firebaseUser,
    profile,
    preferredCourseSlug,
    isStaff,
    canManageAcademy,
    loading,
    authError,
    signInWithGoogle,
    logout,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('inicio');
  const [selectedCourseSlug, setSelectedCourseSlug] = useState<string>('guitiriz');
  const [courseManuallySelected, setCourseManuallySelected] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preselectedTargetUserId, setPreselectedTargetUserId] = useState<string>('');

  useEffect(() => {
    if (firebaseUser && !courseManuallySelected) {
      setSelectedCourseSlug(preferredCourseSlug);
    }
  }, [firebaseUser, preferredCourseSlug, courseManuallySelected]);

  useEffect(() => {
    fetch('/api/courses')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Course[]) => setCourses(list))
      .catch(() => {});
  }, []);

  const handleNavigate = (tab: ActiveTab, courseSlug?: string, targetUserId?: string) => {
    if (courseSlug) {
      setCourseManuallySelected(true);
      setSelectedCourseSlug(courseSlug);
    }
    if (targetUserId !== undefined) setPreselectedTargetUserId(targetUserId);
    setActiveTab(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'inicio', label: 'Campos' },
    { id: 'tee-times', label: 'Tee Times' },
    { id: 'academia', label: 'Academia' },
    { id: 'flota', label: 'Vehículos' },
    {
      id: 'jugadores',
      label: isStaff ? 'Panel Admin' : canManageAcademy ? 'Panel Profesor' : 'Mi Cuenta',
    },
  ];

  const userDisplay =
    profile?.nombre || profile?.apellidos
      ? `${profile.nombre} ${profile.apellidos}`.trim()
      : firebaseUser?.displayName || profile?.email || 'Mi cuenta';

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F9] text-[#111827]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#E2E5EB]">
        <div className="max-w-[1320px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between gap-4 lg:gap-6">
          {/* Zone 1: Brand Logo */}
          <button
            type="button"
            onClick={() => handleNavigate('inicio')}
            aria-label="Iberik Hoteles — Inicio"
            className="inline-flex items-center shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003087] rounded-md"
          >
            <img
              src="/assets/aistudio/Logo-IBK-Hoteles-800x431_c7a84685.jpg"
              alt="Iberik Hoteles"
              className="h-9 lg:h-10 w-auto object-contain"
            />
          </button>

          {/* Zone 2: 5 Single-Line Navigation Links */}
          <nav
            aria-label="Navegación principal"
            className="hidden md:flex items-center gap-3 lg:gap-6 text-xs lg:text-sm font-medium text-[#555C68]"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'text-[#111827] border-[#003087] font-semibold'
                      : 'border-transparent hover:text-[#111827]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Call Buttons + Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="tel:+34644981463"
              title="Llamar a Guitiriz (+34 644 981 463)"
              aria-label="Llamar a Guitiriz al +34644981463"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 lg:px-3 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E2E5EB] hover:border-[#003087] hover:text-[#003087] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true">📞</span>
              <span>Guitiriz</span>
            </a>
            <a
              href="tel:+34684712321"
              title="Llamar a Aguas Santas (+34 684 712 321)"
              aria-label="Llamar a Aguas Santas al +34684712321"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 lg:px-3 py-2 text-xs font-medium text-[#111827] bg-white border border-[#E2E5EB] hover:border-[#003087] hover:text-[#003087] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true">📞</span>
              <span>Aguas Santas</span>
            </a>

            {loading ? (
              <span className="text-xs text-[#7A828E] whitespace-nowrap">Verificando...</span>
            ) : firebaseUser ? (
              <div className="hidden md:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleNavigate('jugadores')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors whitespace-nowrap shrink-0 max-w-[160px] truncate"
                >
                  {userDisplay}
                </button>
                <button
                  type="button"
                  onClick={logout}
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                  className="p-2 text-[#555C68] hover:text-[#111827] border border-[#E2E5EB] rounded-lg"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="hidden md:inline-flex px-4 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Acceder
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Abrir menú"
              className="md:hidden p-2 text-[#111827] border border-[#E2E5EB] rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#E2E5EB] bg-white px-6 py-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`block w-full text-left py-2.5 px-3 text-sm rounded-lg ${
                  activeTab === item.id
                    ? 'bg-[#003087] text-white font-semibold'
                    : 'text-[#111827] hover:bg-[#F4F6F9]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="pt-2 border-t border-[#EBEEF3] space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href="tel:+34644981463"
                  aria-label="Llamar a Guitiriz al +34644981463"
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-medium text-[#111827] bg-white border border-[#E2E5EB] rounded-lg"
                >
                  <span aria-hidden="true">📞</span>
                  <span>Guitiriz</span>
                </a>
                <a
                  href="tel:+34684712321"
                  aria-label="Llamar a Aguas Santas al +34684712321"
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-medium text-[#111827] bg-white border border-[#E2E5EB] rounded-lg"
                >
                  <span aria-hidden="true">📞</span>
                  <span>Aguas Santas</span>
                </a>
              </div>
              {firebaseUser ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-[#111827] truncate">{userDisplay}</span>
                  <button
                    type="button"
                    onClick={logout}
                    className="px-3 py-2 text-xs font-medium border border-[#E2E5EB] rounded-lg"
                  >
                    Salir
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="w-full py-2.5 text-xs font-semibold text-white bg-[#003087] rounded-lg"
                >
                  Acceder con Google
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {authError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-xs text-red-800 text-center">
          {authError}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">
        {activeTab === 'inicio' && (
          <OverviewSection courses={courses} onNavigate={handleNavigate} />
        )}
        {activeTab === 'tee-times' && (
          <TeeTimesView
            initialCourseSlug={selectedCourseSlug}
            initialTargetUserId={preselectedTargetUserId}
          />
        )}
        {activeTab === 'academia' && (
          <AcademyView initialTargetUserId={preselectedTargetUserId} />
        )}
        {activeTab === 'flota' && (
          <FleetView initialTargetUserId={preselectedTargetUserId} />
        )}
        {activeTab === 'jugadores' && (
          <PlayersAndReceptionView
            onBookForPlayer={(tab, userId) => handleNavigate(tab, undefined, userId)}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#E2E5EB] bg-white">
        <div className="max-w-[1320px] mx-auto px-6 lg:px-10 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-[#555C68]">
          <div className="flex items-center gap-4">
            <img
              src="/assets/aistudio/Logo-IBK-Hoteles-800x431_c7a84685.jpg"
              alt="Iberik Hoteles"
              className="h-9 w-auto object-contain shrink-0"
            />
            <div>
              <p className="font-semibold text-[#111827]">
                Golf Guitiriz (9 hoyos) · Golf Aguas Santas (18 hoyos)
              </p>
              <p className="mt-0.5">
                Pago en recepción del campo de golf.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => handleNavigate('tee-times', 'guitiriz')}
              className="hover:text-[#003087]"
            >
              Salidas Guitiriz
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('tee-times', 'aguas-santas')}
              className="hover:text-[#003087]"
            >
              Salidas Aguas Santas
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('academia')}
              className="hover:text-[#003087]"
            >
              Clases Víctor López
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('flota')}
              className="hover:text-[#003087]"
            >
              Vehículos
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
