import React, { useMemo, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import type { UserProfile } from '../types/golf';

interface AdminPlayerSelectorProps {
  players: UserProfile[];
  selectedUserId: string;
  onChange: (userId: string) => void;
  onPlayerCreated: (player: UserProfile) => void;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  currentAdminLabel?: string;
}

export const AdminPlayerSelector: React.FC<AdminPlayerSelectorProps> = ({
  players,
  selectedUserId,
  onChange,
  onPlayerCreated,
  authFetch,
  currentAdminLabel,
}) => {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [licencia, setLicencia] = useState('');
  const [poblacion, setPoblacion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlayer = useMemo(
    () => players.find((u) => String(u.id) === selectedUserId) || null,
    [players, selectedUserId]
  );

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((u) => {
      if (String(u.id) === selectedUserId) return true;
      return [u.nombre, u.apellidos, u.email, u.licencia, u.telefono, u.poblacion]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [players, search, selectedUserId]);

  const formatPlayerLabel = (u: UserProfile) => {
    const fullName = `${u.nombre} ${u.apellidos}`.trim();
    const parts = [fullName || u.email];
    if (u.licencia) parts.push(u.licencia);
    if (fullName) parts.push(u.email);
    return parts.join(' · ');
  };

  const handleCreatePlayer = async () => {
    setError(null);
    if (!nombre.trim() || !apellidos.trim() || !email.trim().includes('@')) {
      setError('Nombre, apellidos y un correo válido son obligatorios.');
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.trim(),
          apellidos: apellidos.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          licencia: licencia.trim().toUpperCase(),
          poblacion: poblacion.trim(),
          role: 'player',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo dar de alta al usuario.');
      }
      const created: UserProfile = body;
      onPlayerCreated(created);
      onChange(String(created.id));
      setCreating(false);
      setNombre('');
      setApellidos('');
      setEmail('');
      setTelefono('');
      setLicencia('');
      setPoblacion('');
      setSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar usuario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-[#111827]">
          Reservar en nombre de usuario
        </label>
        <button
          type="button"
          onClick={() => {
            setCreating((prev) => !prev);
            setError(null);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#003087] bg-white border border-[#E2E5EB] rounded-md hover:border-[#003087] transition-colors whitespace-nowrap shrink-0"
        >
          {creating ? (
            <>
              <X className="w-3 h-3" />
              <span>Cerrar</span>
            </>
          ) : (
            <>
              <UserPlus className="w-3 h-3" />
              <span>Nuevo usuario</span>
            </>
          )}
        </button>
      </div>

      {players.length > 5 && !creating && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, licencia o correo..."
          className="w-full px-3 py-1.5 text-xs bg-white border border-[#E2E5EB] rounded-md text-[#111827] focus-visible:outline-2 focus-visible:outline-[#003087]"
        />
      )}

      {!creating ? (
        <>
          <select
            aria-label="Titular de la reserva"
            value={selectedUserId}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg text-[#111827] focus-visible:outline-2 focus-visible:outline-[#003087]"
          >
            <option value="">
              Mi cuenta actual{currentAdminLabel ? ` (${currentAdminLabel})` : ''}
            </option>
            {filteredPlayers.map((u) => (
              <option key={u.id} value={u.id}>
                {formatPlayerLabel(u)}
              </option>
            ))}
          </select>

          {selectedPlayer && (
            <p className="text-[11px] text-[#003087] font-medium">
              Titular: {`${selectedPlayer.nombre} ${selectedPlayer.apellidos}`.trim() || selectedPlayer.email}
              {selectedPlayer.licencia ? ` · Lic. ${selectedPlayer.licencia}` : ''}
              {selectedPlayer.telefono ? ` · Tel. ${selectedPlayer.telefono}` : ''}
            </p>
          )}
        </>
      ) : (
        <div className="pt-1 space-y-2.5 border-t border-[#E2E5EB]">
          {error && (
            <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre *"
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E5EB] rounded-md"
            />
            <input
              type="text"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              placeholder="Apellidos *"
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E5EB] rounded-md"
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electrónico *"
            className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-[#E2E5EB] rounded-md"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Teléfono"
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-[#E2E5EB] rounded-md"
            />
            <input
              type="text"
              value={licencia}
              onChange={(e) => setLicencia(e.target.value)}
              placeholder="Licencia"
              className="w-full px-2.5 py-1.5 text-xs font-mono uppercase bg-white border border-[#E2E5EB] rounded-md"
            />
            <input
              type="text"
              value={poblacion}
              onChange={(e) => setPoblacion(e.target.value)}
              placeholder="Población"
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E5EB] rounded-md"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleCreatePlayer}
            className="w-full py-2 px-3 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] disabled:opacity-60 rounded-md transition-colors"
          >
            {saving ? 'Guardando usuario...' : 'Guardar y seleccionar para reservar'}
          </button>
        </div>
      )}
    </div>
  );
};
