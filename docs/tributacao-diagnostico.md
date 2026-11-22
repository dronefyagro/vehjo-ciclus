# Diagnóstico e fundação do módulo Tributação

Data da análise: 22/11/2026.

## Arquitetura encontrada

- Frontend e backend: Next.js 16, React 19 e rotas de API do Next.js.
- Hospedagem: Vercel, com implantação contínua a partir do GitHub.
- Persistência operacional: Google Sheets por conta de serviço.
- Autenticação: proteção centralizada das páginas e APIs por credencial de acesso.
- Escopo atual: ambiente único da Dronefy Agro; não existe, nesta fase, isolamento multiempresa por tenant no banco.
- Fontes financeiras preservadas: Notas Fiscais, Contas a Receber, Contas a Pagar, Fluxo de Caixa, DRE Gerencial e Contas Bancárias.

## Componentes oficiais analisados

| Componente | Versão observada | Ambiente | Situação no Ciclus |
|---|---:|---|---|
| Calculadora RTC — Regime Regular | 1.7.2, 18/11/2026 | Java 25, Spring Boot 4.1.2, SQLite/Flyway | Catalogada; implantação e homologação pendentes |
| Calculadora RTC — Simples Nacional | 1.0.2, 18/11/2026 | Java 25, Spring Boot 4.1.2, SQLite/Flyway | Catalogada; implantação e homologação pendentes |
| Gerador de DANFSe | sem release versionada | Go 1.27+, serviço HTTP | Catalogado; implantação e homologação pendentes |

Os três repositórios utilizam licença MIT. A calculadora do Simples Nacional calcula IBS/CBS dentro de seu escopo e não substitui o PGDAS-D. O gerador de DANFSe produz a representação gráfica a partir do XML e não emite nem autoriza NFS-e.

## Fundação implementada

- Nova área Tributação no menu principal.
- Painel de receita bruta e RBT12 alimentado pelas Notas Fiscais.
- Indicadores tributários sem base confiável exibidos como “Não disponível”.
- Cadastro tributário da empresa com vigência e histórico aditivo na aba Configurações.
- Catálogo dos motores oficiais, versões observadas, licença, runtime e status de homologação.
- Endpoint interno de estado do Ciclus Tax Engine que bloqueia cálculos enquanto os motores não estiverem homologados.
- Subáreas e limites de escopo claramente identificados.

## Próximas fases

1. Implantar os serviços Java e Go em contêineres compatíveis, fora das funções serverless de curta duração.
2. Fixar commit e artefatos reproduzíveis de cada motor.
3. Executar os testes oficiais e criar testes de contrato do Ciclus.
4. Implantar armazenamento tributário transacional com tenant, estabelecimento, versão do motor, memória de cálculo e auditoria.
5. Homologar a calculadora oficial antes de liberar qualquer cálculo ao usuário.
6. Integrar apuração, provisão, obrigação, pagamento e conciliação sem alterar os lançamentos financeiros históricos.

Nenhuma alíquota tributária foi criada pelo Ciclus nesta fase.
