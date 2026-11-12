// Rodapé do menu: quem está logado, links de perfil/usuários e botão Sair.
import Link from "next/link";
import { connection } from "next/server";
import { sair } from "@/app/(publico)/login/actions";
import { getUsuarioAtual, nomesPapel, podeGerenciarUsuarios } from "@/lib/auth";

export async function UsuarioNoMenu() {
  await connection();
  const usuario = await getUsuarioAtual();
  const iniciais = usuario.nome
    .split(" ")
    .filter((p) => /^[A-Za-zÀ-ÿ]/.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
          {iniciais}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">{usuario.nome}</div>
          <div className="truncate text-xs text-marca-100/70">{nomesPapel[usuario.papel]}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <Link href="/perfil" className="text-marca-100/80 hover:text-white">Meu perfil</Link>
        {podeGerenciarUsuarios(usuario.papel) && (
          <Link href="/usuarios" className="text-marca-100/80 hover:text-white">Usuários</Link>
        )}
        <form action={sair}>
          <button className="text-marca-100/80 hover:text-white">Sair</button>
        </form>
      </div>
    </div>
  );
}
