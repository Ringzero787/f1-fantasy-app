# uc-v2.4.3 — 2026-10-04

Undercut 2.4.3: Contas unificadas, segurança de compras e recursos premium do Pit Wall.

## Adicionado

- Login entre lojas: sua conta funciona independentemente de você ter instalado pelo Google Play, App Store ou Amazon Appstore
- Compartilhe a classificação da liga e seu time diretamente do app
- Os direitos do Pit Wall Pass agora são revogados quando a loja reembolsa sua compra
- Detalhes no app mostrando o que seu passe comprou
- Redesign do Pit Wall Briefing com seção principal, lista de destaques e variações de preço

## Alterado

- O bloqueio do Ace agora usa o calendário do servidor em vez do calendário embutido
- As projeções do Pit Wall incluem piso, mediana, teto, risco de DNF e estimativas de próximo preço
- O Pit Wall Pass ($14,99/temporada) é o único produto premium; o League Pro agora depende da posse do passe

## Corrigido

- **Segurança**: tokens forjados da Play Store não conseguem mais comprar pacotes ou passes com preços incorretos
- **Segurança**: fallback da chave de API de produção removido; sem downgrade silencioso em erros de configuração
- A janela do Ace agora congela em toda sessão em que ele pontua, não apenas em corridas
- A transferência de login agora fica restrita ao dispositivo que a iniciou
- As compras agora são concedidas uma vez por transação, não uma vez por abertura do app
- As concessões de passe funcionam corretamente após revogações
- Compras presas na fila da loja agora são finalizadas corretamente
- Mapeamento de rodadas corrigido; Bahrein reintegrado em Sepang como R18
- Nove scripts operacionais não falham mais silenciosamente na importação
- O campo SHARE do time agora é lido como controle, não como legenda
- Importação do seeder interrompida; calendário agora correto
- A versão iOS não oferece mais a opção Amazon Appstore

## Segurança

- Bloqueio do Ace movido para o servidor; implementação exclusiva do app removida
- Segredos compartilhados da Amazon e da Apple migrados para o Secret Manager
- IDs de recibo da Amazon usam seu próprio formato, diferente do da Play Store
- Alertas de dependências de alta gravidade resolvidos
- Todas as proteções em tempo de importação e classes de escape agora estão fechadas
