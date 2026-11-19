# VEJHO Ciclus

Plataforma privada de gestão integrada da Dronefy Agro. Reúne operações, contratos, financeiro, faturamento, estoque, pessoas, patrimônio, relatórios e inteligência de negócios.

## Requisitos

- Node.js 22.13 ou superior
- Uma planilha Google Sheets compartilhada com a conta de serviço
- Projeto configurado na Vercel

## Configuração segura

Variáveis obrigatórias na hospedagem:

- `GOOGLE_SHEETS_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

Variáveis opcionais para substituir a credencial de acesso incorporada à versão:

- `CICLUS_ACCESS_USER`: nome do usuário de acesso
- `CICLUS_ACCESS_PASSWORD_SHA256`: hash SHA-256 hexadecimal da nova senha

Para gerar o hash de uma nova senha no PowerShell:

```powershell
$bytes = [Text.Encoding]::UTF8.GetBytes("NOVA-SENHA")
[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
```

Nunca inclua a senha, a chave privada do Google ou credenciais bancárias no repositório.

## Desenvolvimento

```bash
npm install
npm run dev
```

Comandos de verificação:

```bash
npm run check
npm run build
```

`npm run check` executa análise estática, verificação de tipos e testes automatizados. A publicação somente deve ocorrer quando essas verificações e a compilação de produção forem aprovadas.

## Arquitetura

- `app/page.tsx`: leitura inicial dos dados no servidor
- `app/dashboard-client.tsx`: composição da interface administrativa
- `app/api/records`: gravações, atualizações, exclusões e sincronização financeira
- `app/api/bank-statement`: interpretação adaptativa de extratos bancários
- `app/api/card-invoice`: interpretação de faturas para análise de custos
- `app/lib/google-sheets.ts`: autenticação e leitura da base Google Sheets
- `proxy.ts`: autenticação obrigatória antes de páginas e APIs

## Política de dados

- Importações financeiras exigem conferência antes da gravação.
- Dados importados são gravados como valores literais, evitando fórmulas originadas por arquivos externos.
- Alterações aceitam apenas módulos e formatos previstos.
- Respostas com dados privados usam política de não armazenamento em cache.
- Chaves e senhas permanecem somente na hospedagem.

## Versão

A versão atual é exibida em `app/version.ts` e deve permanecer igual à versão do `package.json`. O teste automatizado impede divergência entre elas.
