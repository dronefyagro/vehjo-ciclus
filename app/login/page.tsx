"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
      const requested = new URLSearchParams(window.location.search).get("next");
      window.location.assign(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
      setLoading(false);
    }
  };
  return <main className="login-page"><section className="login-brand"><Image src="/ciclus-logo.svg" alt="Ciclus" width={230} height={74} priority/><span>VEJHO · GESTÃO INTEGRADA</span><div><small>AMBIENTE SEGURO</small><h1>Gestão conectada.<br/>Decisões mais precisas.</h1><p>Acesse os módulos autorizados para o seu perfil.</p></div></section><section className="login-panel"><form onSubmit={submit}><div className="login-symbol"><Image src="/ciclus-symbol.svg" alt="" width={58} height={58}/></div><span>ACESSO À PLATAFORMA</span><h2>Bem-vindo ao Ciclus</h2><p>Informe suas credenciais para continuar.</p>{error && <div className="login-error" role="alert">{error}</div>}<label><span>Usuário</span><input name="username" autoComplete="username" required/></label><label><span>Senha</span><div className="password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required/><button type="button" aria-pressed={showPassword} aria-label={showPassword ? "Ocultar senha" : "Exibir senha"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Ocultar" : "Exibir"}</button></div></label><button disabled={loading}>{loading ? "Verificando..." : "Entrar na plataforma"}</button><small className="login-help">O acesso é registrado e controlado conforme o perfil do usuário.</small></form></section></main>;
}

