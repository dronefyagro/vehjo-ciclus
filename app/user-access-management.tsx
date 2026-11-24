"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ROLE_LABELS, type UserRole } from "./lib/access-control";

type UserView = {
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  source: string;
};

type SaveMode = "close" | "continue";

const formatTimestamp = (user: UserView) => {
  const value = user.updatedAt || user.createdAt;
  if (!value || value === "Conta inicial") return value || "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
};

export default function UserAccessManagement() {
  const [users, setUsers] = useState<UserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<UserView | null>(null);
  const [creating, setCreating] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | UserRole>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const result = await response.json() as { users?: UserView[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível consultar os usuários.");
      setUsers(result.users ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível consultar os usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleUsers = useMemo(
    () => filter === "all" ? users : users.filter((user) => user.role === filter),
    [filter, users],
  );

  const openNewUser = () => {
    setEditing(null);
    setCreating(true);
    setMessage("");
    setFormKey((current) => current + 1);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setMessage("");
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode: SaveMode = submitter?.value === "continue" ? "continue" : "close";
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("passwordConfirmation") ?? "");
    if (password !== passwordConfirmation) {
      setMessage("A confirmação de senha não corresponde à senha informada.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: editing ? "update" : "create",
          username: form.get("username"),
          name: form.get("name"),
          role: form.get("role"),
          password,
          active: form.get("active") === "on",
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o usuário.");
      await load();
      if (!editing && mode === "continue") {
        setFormKey((current) => current + 1);
        setMessage("Usuário criado. Preencha os dados do próximo acesso.");
      } else {
        setCreating(false);
        setEditing(null);
        setMessage(editing ? "Acesso atualizado com sucesso." : "Usuário criado com sucesso.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="module-page access-page">
    <div className="module-intro">
      <div className="module-title"><span className="module-icon">⌘</span><div><span>ADMINISTRAÇÃO DA PLATAFORMA</span><h2>Usuários e Acessos</h2><p>Controle de credenciais e perfis de permissão</p></div></div>
      <button className="primary-action" onClick={openNewUser}>＋ Novo usuário</button>
    </div>
    {message && <div className="action-message" role="status">{message}</div>}
    <div className="access-summary">
      <article><strong>{users.length}</strong><span>Usuários cadastrados</span></article>
      <article><strong>{users.filter((user) => user.active).length}</strong><span>Acessos ativos</span></article>
      <article><strong>{users.filter((user) => user.role === "user").length}</strong><span>Usuários padrão</span></article>
      <article><strong>{users.filter((user) => user.role === "admin").length}</strong><span>Administradores</span></article>
    </div>
    <section className="card access-table">
      <div className="access-toolbar"><strong>Perfis cadastrados</strong><label><span>Filtrar perfil</span><select value={filter} onChange={(event) => setFilter(event.target.value as "all" | UserRole)}><option value="all">Todos</option><option value="admin">Administradores</option><option value="supervisor">Supervisores</option><option value="user">Usuários padrão</option></select></label></div>
      <table><thead><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Status</th><th>Última alteração</th><th>Ações</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6}>Carregando acessos...</td></tr> : visibleUsers.length === 0 ? <tr><td colSpan={6}>Nenhum usuário encontrado neste perfil.</td></tr> : visibleUsers.map((user) => <tr key={user.username}><td><strong>{user.username}</strong></td><td>{user.name}</td><td><span className={`role-badge ${user.role}`}>{ROLE_LABELS[user.role]}</span></td><td><span className={`access-status ${user.active ? "active" : "inactive"}`}>{user.active ? "Ativo" : "Inativo"}</span></td><td>{formatTimestamp(user)}</td><td><button onClick={() => { setEditing(user); setCreating(true); setMessage(""); }}>Editar acesso</button></td></tr>)}
      </tbody></table>
    </section>
    {creating && <div className="modal-backdrop"><section className="edit-modal access-modal" role="dialog" aria-modal="true" aria-labelledby="access-title">
      <div className="modal-head"><div><span>{editing ? "ATUALIZAR ACESSO" : "NOVO ACESSO"}</span><h3 id="access-title">Usuário da plataforma</h3></div><button onClick={() => setCreating(false)} aria-label="Fechar">×</button></div>
      <form key={formKey} onSubmit={submit} className="form-grid">
        <label><span>Usuário</span><input name="username" defaultValue={editing?.username} readOnly={Boolean(editing)} minLength={3} maxLength={50} autoComplete="username" required/><small>Use letras, números, ponto, hífen ou sublinhado.</small></label>
        <label><span>Nome completo</span><input name="name" defaultValue={editing?.name} maxLength={100} autoComplete="name" required/></label>
        <label><span>Perfil de permissão</span><select name="role" defaultValue={editing?.role ?? "user"}><option value="admin">Administrador</option><option value="supervisor">Supervisor</option><option value="user">Usuário padrão</option></select></label>
        <label><span>{editing ? "Nova senha (opcional)" : "Senha temporária"}</span><input name="password" type="password" minLength={10} maxLength={200} autoComplete="new-password" required={!editing} placeholder={editing ? "Deixe em branco para manter" : "Mínimo de 10 caracteres"}/></label>
        <label><span>Confirmar senha</span><input name="passwordConfirmation" type="password" minLength={10} maxLength={200} autoComplete="new-password" required={!editing} placeholder={editing ? "Repita apenas se alterar" : "Repita a senha"}/></label>
        <label className="access-active"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true}/><span>Acesso ativo</span></label>
        <div className="access-permission-note"><strong>{editing ? ROLE_LABELS[editing.role] : "Usuário padrão"}</strong><span>O administrador pode alterar o perfil, bloquear o acesso e redefinir a senha posteriormente.</span></div>
        <div className="modal-actions"><button type="button" className="cancel-action" onClick={() => setCreating(false)} disabled={saving}>Cancelar</button>{!editing && <button name="saveMode" value="continue" className="secondary-save-action" disabled={saving}>{saving ? "Salvando..." : "Salvar e cadastrar outro"}</button>}<button name="saveMode" value="close" className="save-action" disabled={saving}>{saving ? "Salvando..." : "Salvar acesso"}</button></div>
      </form>
    </section></div>}
  </div>;
}
