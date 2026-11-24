"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ROLE_LABELS, type UserRole } from "./lib/access-control";

type UserView = { username: string; name: string; role: UserRole; active: boolean; createdAt: string; updatedAt: string; source: string };

export default function UserAccessManagement() {
  const [users, setUsers] = useState<UserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserView | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const result = await response.json() as { users?: UserView[]; error?: string };
    if (response.ok) setUsers(result.users ?? []); else setMessage(result.error ?? "Não foi possível consultar os usuários.");
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.get("username"), name: form.get("name"), role: form.get("role"), password: form.get("password"), active: form.get("active") === "on" }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setMessage(result.error ?? "Não foi possível salvar o usuário.");
    setCreating(false); setEditing(null); setMessage("Usuário e permissões salvos com sucesso."); await load();
  };
  return <div className="module-page access-page"><div className="module-intro"><div className="module-title"><span className="module-icon">⌘</span><div><span>ADMINISTRAÇÃO DA PLATAFORMA</span><h2>Usuários e Acessos</h2><p>Controle de credenciais e perfis de permissão</p></div></div><button className="primary-action" onClick={() => { setEditing(null); setCreating(true); }}>＋ Novo usuário</button></div>{message && <div className="action-message">{message}</div>}<div className="access-summary"><article><strong>{users.length}</strong><span>Usuários cadastrados</span></article><article><strong>{users.filter((user) => user.active).length}</strong><span>Acessos ativos</span></article><article><strong>{users.filter((user) => user.role === "admin").length}</strong><span>Administradores</span></article></div><section className="card access-table"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Status</th><th>Última alteração</th><th>Ações</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}>Carregando acessos...</td></tr> : users.map((user) => <tr key={user.username}><td><strong>{user.username}</strong></td><td>{user.name}</td><td><span className={`role-badge ${user.role}`}>{ROLE_LABELS[user.role]}</span></td><td>{user.active ? "Ativo" : "Inativo"}</td><td>{user.updatedAt ? new Date(user.updatedAt).toLocaleString("pt-BR") : user.createdAt}</td><td><button onClick={() => { setEditing(user); setCreating(true); }}>Editar acesso</button></td></tr>)}</tbody></table></section>{creating && <div className="modal-backdrop"><section className="edit-modal access-modal" role="dialog" aria-modal="true" aria-labelledby="access-title"><div className="modal-head"><div><span>{editing ? "ATUALIZAR ACESSO" : "NOVO ACESSO"}</span><h3 id="access-title">Usuário da plataforma</h3></div><button onClick={() => setCreating(false)} aria-label="Fechar">×</button></div><form onSubmit={submit} className="form-grid"><label><span>Usuário</span><input name="username" defaultValue={editing?.username} readOnly={Boolean(editing)} required/></label><label><span>Nome</span><input name="name" defaultValue={editing?.name} required/></label><label><span>Perfil</span><select name="role" defaultValue={editing?.role ?? "user"}><option value="admin">Administrador</option><option value="supervisor">Supervisor</option><option value="user">Usuário padrão</option></select></label><label><span>{editing ? "Nova senha" : "Senha"}</span><input name="password" type="password" minLength={10} required placeholder="Mínimo de 10 caracteres"/></label><label className="access-active"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true}/><span>Acesso ativo</span></label><div className="modal-actions"><button type="button" className="cancel-action" onClick={() => setCreating(false)}>Cancelar</button><button className="save-action">Salvar acesso</button></div></form></section></div>}</div>;
}

