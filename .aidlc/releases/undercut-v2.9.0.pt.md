# uc-v2.9.0 — 2026-11-24

Undercut 2.9.0: reconhecimento dinâmico de temporada, correções de pontuação e regras de contrato mais justas

## Adicionado

- Banner de avisos controlado pelo servidor no painel do Time, para comunicados rápidos sem precisar atualizar o app
- Destaque visual para vagas de escalação abertas (cor suave, borda tracejada, sinal de mais com anel)
- O preenchimento automático agora zera o contador de penalidade por elenco desatualizado, assim como uma transferência manual
- Agregador de estatísticas para administradores com insights de uso diário
- Nova tentativa automática para resultados de corrida retidos com nome de carro não identificado
- Testes completos de correção de corrida no emulador do Firestore

## Alterado

- **Mudança importante:** o app agora lê a temporada atual pelo servidor em vez do ano do dispositivo — é necessário atualizar o app para funcionar corretamente em 2027
- A duração dos contratos agora é limitada pelas corridas restantes na temporada e por sequências de seis corridas por piloto
- Correções de resultado pós-corrida agora recalculam a pontuação de todos os times afetados dentro de uma janela de 72 horas
- Vendas por vencimento agora usam os preços pós-corrida, não os de pré-corrida
- A virada de temporada agora arquiva 2026, reinicia times e classificações, e define preços e calendário de 2027
- A venda do Pit Wall Pass foi movida para dezembro, para a próxima temporada (disponível na entressafra)
- Contas de teste da loja agora são excluídas das estatísticas de administrador

## Corrigido

- Reembolso das penalidades por elenco desatualizado para times preenchidos automaticamente em Las Vegas 2026
- Compatibilidade com iOS 15.1+ (suporte ao Xcode 27, proteção para iOS 16 no expo-router)
- Correções de corrida e reparos de vencimento agora são gravados de forma atômica com set+mergeFields
- O reparo de vendas por vencimento agora evita que o orçamento fique negativo
- A virada de temporada agora reinicia os times com a sequência correta de preços
- Revisão de segurança das dependências; removida a isenção geral de GHSA

## Segurança

- Regras de leitura do Firestore restritas a administradores para estatísticas agregadas
- Vulnerabilidades de dependências corrigidas
