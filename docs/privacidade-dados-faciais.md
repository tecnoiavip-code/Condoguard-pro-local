# Privacidade e dados faciais

Este documento descreve como o PortalGuard Local trata fotos e dados de reconhecimento facial. Ele deve ser lido junto com a política de privacidade do condomínio.

## Dados tratados

- Foto do rosto do visitante/prestador cadastrada no **Novo Cadastro**.
- Descritor facial numérico (vetor gerado a partir da foto). O descritor não reconstrói a imagem, mas é tratado como dado biométrico.
- Nome, documento, tipo de visita, empresa, veículo e registros de entrada/saída associados.
- Histórico de leituras e pedidos de liberação facial da portaria.

## Finalidade e base legal

Os dados são usados exclusivamente para identificar a pessoa na portaria, registrar a entrada/saída e permitir a liberação facial de uso único. A base legal deve ser definida pelo condomínio (consentimento do titular ou outra hipótese aplicável da LGPD), com aviso claro no momento do cadastro.

## Consentimento e alternativa

- O cadastro deve informar, de forma destacada, que a foto será usada para reconhecimento facial.
- O visitante pode recusar o tratamento biométrico e ser identificado pelos meios convencionais (documento, nome ou autorização manual), sem impedimento de acesso.
- O consentimento deve ser registrado pelo condomínio (por exemplo, no cadastro ou em termo próprio) e pode ser revogado; após a revogação, a foto e o descritor devem ser removidos.

## Retenção

- Pedidos de liberação já resolvidos: removidos após **30 dias**.
- Descritores faciais sem atualização: removidos após **30 dias** e recriados apenas se houver nova leitura com foto válida.
- Fotos de visitantes: permanecem vinculadas ao registro de acesso enquanto ele existir; o pedido facial não guarda uma segunda cópia da foto em base64.
- A limpeza é executada na inicialização do servidor e a cada 24 horas. A exclusão manual de uma foto/entrada também remove a possibilidade de novo reconhecimento.

## Segurança e criptografia

- No modo local, os dados ficam no computador da portaria (SQLite). O aplicativo **não implementa criptografia de campo**; recomenda-se habilitar BitLocker/criptografia de disco, conta de usuário restrita, backup protegido e controle de acesso físico ao equipamento.
- No modo nuvem, o tráfego usa TLS e o armazenamento/banco ficam no Supabase com autenticação e políticas de acesso (RLS). O acesso às funções de liberação exige usuário autenticado com papel de portaria.
- O token de acesso do dispositivo/Control iD e as chaves do Supabase devem ser mantidos fora de logs e de repositórios; revogue credenciais expostas.

## Direitos do titular

O titular pode solicitar confirmação de tratamento, acesso, correção, eliminação e informação sobre compartilhamento. O condomínio deve ter um canal para atender esses pedidos e registrar a exclusão.

## Limitações conhecidas

- Fotos antigas em WebP podem não ser indexadas pelo motor facial; reenvie a foto em JPEG se o visitante não for reconhecido.
- O reconhecimento facial é uma ajuda à portaria; a decisão final e a contingência continuam sob responsabilidade dos operadores e das regras de segurança do condomínio.
