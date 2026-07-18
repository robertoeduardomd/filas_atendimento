// ==========================================
// 1. INICIALIZAÇÃO DO CLIENTE SUPABASE
// ==========================================
const db = supabase.createClient('https://utqjbiipydwaftygvxnl.supabase.co', 'sb_publishable_Wbi-63LwW0zrY1pjhU23Ww_OVum61R0');

// ==========================================
// 2. VARIÁVEIS GLOBAIS
// ==========================================
let filaAtualId = 1;
let usuario = JSON.parse(localStorage.getItem('usuarioFila'));

// ==========================================
// 3. INICIALIZAÇÃO AO CARREGAR A PÁGINA
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Garante que os modais estejam ocultos ao carregar
    document.getElementById('modalLogin').style.display = 'none';
    document.getElementById('modalAlterarSenha').style.display = 'none';
verificarSessaoFantasma();

    carregarDados();
    carregarListaForaDaFila();
    carregarListaUsuariosParaLogin();
    carregarHistorico();
    configurarRealtime();
});


// ==========================================
// FUNÇÕES DA FILA PRINCIPAL
// ==========================================

async function carregarDados() {
    // Busca a fila específica ordenando corretamente
    const { data: fila, error } = await db
        .from('fila_atual')
        .select('*, colaboradores(nome, cor)')
        .eq('fila_id', filaAtualId)
        .order('ordem', { ascending: false });

    if (error) return console.error("Erro ao carregar Fila:", error);

    renderizarFila(fila || []);

    // Atualiza o botão verde/vermelho
    if (usuario) {
        const estaNaFila = fila.some(item => item.colaborador_id === usuario.id);
        atualizarBotaoFila(estaNaFila);
    } else {
        atualizarBotaoFila(false);
    }

    // Atualiza botão do cabeçalho
    const btnHeader = document.getElementById('btnLoginHeader');
    if (btnHeader) {
        if (usuario) {
            btnHeader.innerHTML = `<span>${usuario.nome}</span> <button onclick="logout()" style="margin-left:10px; background:#f44336; border:none; color:white; padding:2px 8px; cursor:pointer;">Logout</button>`;
            btnHeader.onclick = null;
        } else {
            btnHeader.innerText = "Entrar / Login";
            btnHeader.onclick = abrirLogin;
        }
    }
}

function renderizarFila(dados) {
    const container = document.getElementById('fila');
    // Força a limpeza absoluta
    container.innerHTML = ''; 
    
    // Agora renderiza
    container.innerHTML = dados.map((item, index) => `
        <div class="usuario">
            <span style="margin-right: 10px; color: #888; font-weight: bold;">${index + 1}º</span>
            <span class="cor" style="background:${item.colaboradores?.cor || '#ccc'}"></span>
            ${item.colaboradores?.nome || 'Desconhecido'}
        </div>
    `).join('');
}

async function carregarListaForaDaFila() {
    const { data: todos } = await db.from('colaboradores').select('*');
    const { data: naFila } = await db.from('fila_atual').select('colaborador_id').eq('fila_id', filaAtualId);
    
    const idsNaFila = naFila ? naFila.map(i => i.colaborador_id) : [];
    const foraDaFila = (todos || []).filter(c => !idsNaFila.includes(c.id));
    
    const container = document.getElementById('foraFila');
    // Limpeza absoluta antes de qualquer coisa
    container.innerHTML = ''; 
    
    container.innerHTML = foraDaFila.map(c => `
        <div class="usuario">
            <span class="cor" style="background:${c.cor || '#ccc'}"></span>
            ${c.nome || 'Sem nome'}
        </div>
    `).join('');
}

function atualizarBotaoFila(estaNaFila) {
    const btn = document.getElementById('btnFila');
    if (!btn) return;
    
    btn.innerText = estaNaFila ? "Sair da fila" : "Entrar na fila";
    btn.style.background = estaNaFila ? "#F44336" : "#00C853";
    
    // FIX IMPORTANTE: Mantém o toggleMinhaPosicao SEMPRE. Não sobrescreve.
    btn.onclick = toggleMinhaPosicao; 
}


// ==========================================
// AÇÕES DE ENTRAR E SAIR (O DESLOCAMENTO)
// ==========================================

async function toggleMinhaPosicao() {
    if (!usuario) {
        abrirLogin();
        return;
    }

    // Desabilita o botão temporariamente para evitar cliques duplos rápidos
    document.getElementById('btnFila').disabled = true;

    try {
        const { data: naFila } = await db.from('fila_atual')
            .select('id')
            .eq('colaborador_id', usuario.id)
            .eq('fila_id', filaAtualId);

        if (naFila && naFila.length > 0) {
            await sairDaFila(); 
        } else {
            await entrarNaFila(); 
        }
    } finally {
        document.getElementById('btnFila').disabled = false;
    }
}

async function entrarNaFila() {
    if (!usuario) return;

    // ==========================================
    // TRAVA ANTI-CLONE: Verifica se já está na fila ANTES de inserir
    // ==========================================
    const { data: checagem } = await db.from('fila_atual')
        .select('id')
        .eq('colaborador_id', usuario.id)
        .eq('fila_id', filaAtualId);

    if (checagem && checagem.length > 0) {
        console.log("Bloqueado: Usuário já está na fila!");
        return; // Para a função aqui e não insere de novo
    }
    // ==========================================

    // 1. Descobre a próxima ordem
    const { data: ultimaFila } = await db.from('fila_atual')
        .select('ordem')
        .eq('fila_id', filaAtualId)
        .order('ordem', { ascending: false })
        .limit(1);

    const novaOrdem = (ultimaFila && ultimaFila.length > 0) ? (ultimaFila[0].ordem + 1) : 1;

    // 2. Insere
    const { error } = await db.from('fila_atual').insert([
        { fila_id: filaAtualId, colaborador_id: usuario.id, ordem: novaOrdem }
    ]);

    if (error) return alert("Erro ao entrar: " + error.message);

    
    // 3. Histórico e Atualização Visual IMEDIATA
    registrarHistorico('entrou'); 
    await carregarDados();
    await carregarListaForaDaFila();
}

async function sairDaFila() {
    if (!usuario) return;

    // 1. Deleta
    const { error } = await db.from('fila_atual')
        .delete()
        .eq('colaborador_id', usuario.id)
        .eq('fila_id', filaAtualId);

    if (error) return alert("Erro ao sair: " + error.message);

    // 2. Histórico e Atualização Visual IMEDIATA
    registrarHistorico('saiu');
    await carregarDados();
    await carregarListaForaDaFila();
}

async function entrarNaFilaDireto(idColaborador) {
    // Usado se clicar direto no nome de alguém em modo Admin/etc
    const { data: colab } = await db.from('colaboradores').select('*').eq('id', idColaborador).single();
    if (!colab) return;
    
    localStorage.setItem('usuarioFila', JSON.stringify(colab));
    usuario = colab; 
    
    await toggleMinhaPosicao(); // Reaproveitamos a função que já está perfeita
}

function mudarFila(id, nome) {
    filaAtualId = id;
    document.getElementById('tituloFila').innerText = `FILA ${nome}`;
    carregarDados();
    carregarListaForaDaFila();
    carregarHistorico();
}


// ==========================================
// FUNÇÕES DO ADMINISTRADOR
// ==========================================

function toggleAdmin(){

    if(!usuario){
        alert("Faça login primeiro.");
        return;

    }

    if(!usuario.administrador){
        alert("Você não possui permissão de administrador.");
        return;
    }
   let ndmenuadm = document.getElementById("modalMenuAdmin");
   ndmenuadm.style.display="flex";
   ndmenuadm.style.flexDirection="column";
   ndmenuadm.style.lineHeigth="5px";
   ndmenuadm.style.justify="space-between";
}

async function salvarColaborador() {
    // A MÁGICA ESTÁ AQUI: Forçamos o JS a olhar APENAS para dentro do '#modalNovoColaborador'
    const inputNome = document.querySelector('#modalNovoColaborador #nomeColaborador');
    const inputCor = document.querySelector('#modalNovoColaborador #corColaborador');
    
    // Pegamos o valor e removemos espaços em branco
    const nome = inputNome ? inputNome.value.trim() : '';
    const cor = inputCor ? inputCor.value : '#3498db';

    if (!nome) {
        alert("Digite um nome válido!");
        if (inputNome) inputNome.focus(); 
        return;
    }

    const { error } = await db.from('colaboradores').insert([{ nome: nome, cor: cor }]);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        alert("Colaborador cadastrado com sucesso!");
        
        // Limpa o campo
        inputNome.value = ''; 
        
        // Fecha o modal
        fecharModal('modalNovoColaborador'); 
        
        // Atualiza a lista na tela
        await carregarListaForaDaFila(); 
    }
}


// ==========================================
// LOGIN E AUTENTICAÇÃO
// ==========================================

function abrirLogin() {
    document.getElementById('modalLogin').style.display = 'flex';
    carregarListaUsuariosParaLogin();
}

async function carregarListaUsuariosParaLogin() {
    const { data: colabs, error } = await db.from('colaboradores').select('id, nome');
    if (error) return console.error(error);
    
    const select = document.getElementById('selectUsuario');
    select.innerHTML = colabs.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
}

async function validarLogin() {
    const id = document.getElementById('selectUsuario').value;
    const senhaDigitada = document.getElementById('inputSenha').value;

    const { data: colab, error } = await db.from('colaboradores')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !colab) return alert("Erro ao encontrar colaborador.");

    if (colab.senha === senhaDigitada) {
        usuario = colab; 

        if (senhaDigitada === (colab.nome.toLowerCase() + '123')) {
            alert("Primeiro acesso! Por favor, defina uma nova senha.");
            document.getElementById('modalLogin').style.display = 'none';
            document.getElementById('modalAlterarSenha').style.display = 'flex';
        } else {
            localStorage.setItem('usuarioFila', JSON.stringify(colab));
            document.getElementById('modalLogin').style.display = 'none';
            
            // Em vez de dar reload na página, apenas atualiza a tela suavemente
            carregarDados();
        }
    } else {
        alert("Senha incorreta!");
    }
}

async function salvarNovaSenha() {
    const novaSenha = document.getElementById('novaSenha').value;
    
    if (!novaSenha) return alert("Digite uma nova senha!");
    if (!usuario || !usuario.id) return alert("Erro de usuário. Refaça o login.");

    const { error } = await db.from('colaboradores').update({ senha: novaSenha }).eq('id', usuario.id);

    if (error) return alert("Erro ao salvar senha no banco: " + error.message);

    alert("Senha alterada com sucesso!");
    usuario.senha = novaSenha;
    localStorage.setItem('usuarioFila', JSON.stringify(usuario));
    
    document.getElementById('modalAlterarSenha').style.display = 'none';
    carregarDados();
}

function logout() {
    localStorage.removeItem('usuarioFila');
    usuario = null;
    alert("Você saiu do sistema.");
    carregarDados();
    carregarListaForaDaFila();
}


// ==========================================
// UTILITÁRIOS E HISTÓRICO
// ==========================================

async function registrarHistorico(acao) {
    if (!usuario) return;
    
    const { error } = await db.from('historico').insert([
        { fila_id: filaAtualId, colaborador_id: usuario.id, acao }
    ]);
    
    if (!error) {
        // Atualiza a lista na tela no exato segundo que a ação acontece
        await carregarHistorico(); 
    }
}
function abrirNovoColaborador(){

    document.getElementById("modalMenuAdmin").style.display="none";

    document.getElementById("modalNovoColaborador").style.display="flex";

}
function fecharModalAdmin(){

    document.getElementById("modalMenuAdmin").style.display="none";

    document.getElementById("modalNovoColaborador").style.display="none";

}
function fecharModal(idModal) {
    document.getElementById(idModal).style.display = 'none';
}
// ==========================================
// FUNÇÕES DE EDIÇÃO DE COLABORADOR
// ==========================================

// Uma variável global rápida só para guardarmos os dados da lista e preencher os inputs sem precisar ir no banco de novo
let listaColaboradoresEdicao = [];

async function abrirEditarColaborador() {
    // 1. Fecha o menu de admin e abre a tela de edição
    fecharModal('modalMenuAdmin');
    document.getElementById('modalEditarColaborador').style.display = 'flex';

    // 2. Busca todo mundo no banco em ordem alfabética
    const { data: colabs, error } = await db.from('colaboradores')
        .select('*')
        .order('nome', { ascending: true });
        
    if (error) return alert("Erro ao carregar colaboradores: " + error.message);

    listaColaboradoresEdicao = colabs; // Salva na memória

    // 3. Preenche a caixinha de seleção (select)
    const select = document.getElementById('selectEditarColaborador');
    select.innerHTML = '<option value="">Selecione um colaborador...</option>' + 
        colabs.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

    // 4. Zera os campos de baixo para não ficar lixo de edições anteriores
    document.getElementById('nomeEditarColaborador').value = '';
    document.getElementById('corEditarColaborador').value = '#3498db';
}

function preencherDadosEdicao() {
    const idSelecionado = document.getElementById('selectEditarColaborador').value;
    const inputNome = document.getElementById('nomeEditarColaborador');
    const inputCor = document.getElementById('corEditarColaborador');
    
    // Se a pessoa voltou para a opção "Selecione...", a gente zera os campos
    if (!idSelecionado) {
        inputNome.value = '';
        inputCor.value = '#3498db';
        return;
    }

    // Procura na nossa memória quem é o colaborador escolhido e preenche as caixas
    const colab = listaColaboradoresEdicao.find(c => c.id == idSelecionado);
    if (colab) {
        inputNome.value = colab.nome;
        inputCor.value = colab.cor;
    }
}

async function salvarEdicaoColaborador() {
    const idSelecionado = document.getElementById('selectEditarColaborador').value;
    const nomeEditado = document.getElementById('nomeEditarColaborador').value.trim();
    const corEditada = document.getElementById('corEditarColaborador').value;

    // Travas de segurança
    if (!idSelecionado) return alert("Selecione um colaborador primeiro!");
    if (!nomeEditado) return alert("O nome não pode ficar vazio!");

    // Manda o Supabase fazer um UPDATE onde o ID for igual ao selecionado
    const { error } = await db.from('colaboradores')
        .update({ nome: nomeEditado, cor: corEditada })
        .eq('id', idSelecionado);

    if (error) {
        alert("Erro ao atualizar: " + error.message);
    } else {
        alert("Colaborador atualizado com sucesso!");
        fecharModal('modalEditarColaborador');
        
        // Atualiza a tela para mostrar a nova cor e nome na hora
        await carregarDados();
        await carregarListaForaDaFila(); 
    }
}
// ==========================================
// FUNÇÕES DE REMOÇÃO DE COLABORADOR
// ==========================================

// Variável para guardar quem o usuário escolheu antes de confirmar
let idColaboradorParaRemover = null;

async function abrirRemoverColaborador() {
    fecharModal('modalMenuAdmin');
    document.getElementById('modalRemoverColaborador').style.display = 'flex';

    // Busca os colaboradores em ordem alfabética
    const { data: colabs, error } = await db.from('colaboradores')
        .select('id, nome')
        .order('nome', { ascending: true });
        
    if (error) return alert("Erro ao carregar colaboradores: " + error.message);

    // Preenche a lista e salva o nome em um atributo "data-nome" para usarmos depois
    const select = document.getElementById('selectRemoverColaborador');
    select.innerHTML = '<option value="">Selecione um colaborador...</option>' + 
        colabs.map(c => `<option value="${c.id}" data-nome="${c.nome}">${c.nome}</option>`).join('');
}

function abrirConfirmacaoRemocao() {
    const select = document.getElementById('selectRemoverColaborador');
    const idSelecionado = select.value;
    
    if (!idSelecionado) return alert("Selecione um colaborador primeiro!");

    // Descobre o nome do colaborador selecionado para exibir no aviso
    const nomeSelecionado = select.options[select.selectedIndex].getAttribute('data-nome');
    idColaboradorParaRemover = idSelecionado;

    // Personaliza a mensagem de erro com o nome da pessoa
    document.getElementById('textoConfirmacaoRemocao').innerHTML = `Você deseja realmente excluir o colaborador <strong>${nomeSelecionado}</strong>? Esta ação não pode ser desfeita.`;

    // Esconde a tela de seleção e mostra a tela de perigo
    document.getElementById('modalRemoverColaborador').style.display = 'none';
    document.getElementById('modalConfirmarRemocao').style.display = 'flex';
}

function cancelarConfirmacaoRemocao() {
    // Se ele cancelar, esvaziamos a variável de segurança e voltamos para a tela anterior
    idColaboradorParaRemover = null;
    document.getElementById('modalConfirmarRemocao').style.display = 'none';
    document.getElementById('modalRemoverColaborador').style.display = 'flex';
}

async function executarRemocao() {
    if (!idColaboradorParaRemover) return;

    // Dispara o DELETE para o Supabase
    const { error } = await db.from('colaboradores')
        .delete()
        .eq('id', idColaboradorParaRemover);

    if (error) {
        alert("Erro ao remover: " + error.message);
    } else {
        alert("Colaborador removido com sucesso!");
        
        // Fecha tudo e limpa a variável
        fecharModal('modalConfirmarRemocao');
        idColaboradorParaRemover = null;
        
        // Se o próprio usuário logado for deletado, faz o logout dele
        if (usuario && usuario.id == idColaboradorParaRemover) {
            logout();
        } else {
            // Atualiza a tela para remover o bloquinho de quem foi deletado
            await carregarDados();
            await carregarListaForaDaFila();
        }
    }
}
async function carregarHistorico() {
    // Busca os últimos 8 registros da fila atual, ordenando do mais novo para o mais velho
    // Nota: Assumindo que a coluna de data automática do seu Supabase se chama 'created_at'
    const { data: historico, error } = await db.from('historico')
        .select('*, colaboradores(nome, cor)')
        .eq('fila_id', filaAtualId)
        .order('created_at', { ascending: false })
        .limit(8);

    if (error) {
        console.error("Erro ao carregar histórico:", error.message);
        return;
    }

    const container = document.getElementById('listaHistorico');
    
    if (!historico || historico.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #888; text-align: center;">Nenhuma movimentação recente.</div>';
        return;
    }

    // Monta a lista visualmente
    container.innerHTML = historico.map(item => {
        // Formata a data do Supabase para o padrão Brasileiro (ex: 17/07 20:33)
        const dataFormatada = new Date(item.created_at).toLocaleString('pt-BR', {
           
            hour: '2-digit', 
            minute: '2-digit',
             day: '2-digit', 
            month: '2-digit'
        });
        
        // Define as cores e os textos da ação
        const acaoTexto = item.acao === 'entrou' ? 'entrou na fila ' : 'saiu da fila ';
        const corAcao = item.acao === 'entrou' ? '#00C853' : '#F44336'; 

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #333;">
                <div>
                    <span class="cor" style="background:${item.colaboradores?.cor || '#ccc'}; width: 12px; height: 12px; display: inline-block; border-radius: 50%; margin-right: 8px;"></span>
                    <strong style="color: #fff;">${item.colaboradores?.nome || 'Desconhecido'}</strong> 
                    <span style="color: ${corAcao}; font-size: 0.9em; margin-left: 5px;">${acaoTexto}</span>
                </div>
                <div style="color: #f3f707; font-size: 0.85em;">
                     ${dataFormatada}
                </div>
            </div>
        `;
    }).join('');
}
async function verificarSessaoFantasma() {
    if (!usuario) return; // Se não tem ninguém logado, não precisa checar

    // Vai no banco e tenta achar o usuário logado
    const { data: colab, error } = await db.from('colaboradores')
        .select('id')
        .eq('id', usuario.id)
        .single();

    // Se deu erro ou não achou o usuário, ele foi deletado!
    if (error || !colab) {
        console.log("Usuário deletado detectado. Limpando sessão...");
        localStorage.removeItem('usuarioFila');
        usuario = null;
        alert("Sua sessão expirou ou seu usuário foi removido.");
        carregarDados();
        carregarListaForaDaFila();
    }
}

function configurarRealtime() {
    // Usamos um único canal para todas as escutas
    db.channel('schema-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'fila_atual' },
            (payload) => {
                console.log('Mudança na fila detectada!', payload);
                // Atualiza tudo para garantir que "fora da fila" e "na fila" fiquem sincronizados
                carregarDados(); 
                carregarListaForaDaFila(); 
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'historico' },
            (payload) => {
                console.log('Mudança no histórico detectada!', payload);
                carregarHistorico();
            }
        )
        .subscribe();
}

async function atualizarCenarioCompleto() {
    // Garante que ambos os lados da moeda sejam buscados e renderizados
    await carregarDados(); // Atualiza a Fila (Na fila)
    await carregarListaForaDaFila(); // Atualiza a lista (Fora da fila)
    await carregarHistorico(); // Atualiza o histórico
}