// ==========================================
// 1. INICIALIZAÇÃO DO CLIENTE SUPABASE
// ==========================================
const db = supabase.createClient('https://utqjbiipydwaftygvxnl.supabase.co', 'sb_publishable_Wbi-63LwW0zrY1pjhU23Ww_OVum61R0');

// ==========================================
// 2. VARIÁVEIS GLOBAIS
// ==========================================
let usuario = JSON.parse(localStorage.getItem('usuarioFila'));
let todasAsFilas = []; // Guarda as configurações de filas (Aneel, Nice, Anatel, etc)
let lagosta = null


const somEntrar = new Audio('entrar.mp3'); 
const somSair = new Audio('sair.mp3'); 



// ==========================================
// 3. INICIALIZAÇÃO AO CARREGAR A PÁGINA
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('modalLogin').style.display = 'none';
    document.getElementById('modalAlterarSenha').style.display = 'none';
    
    verificarSessaoFantasma();
    await carregarEstruturaDasFilas(); // Puxa do banco e cria os cards HTML na tela
    
    carregarDados();
    carregarListaForaDaFila();
    carregarListaUsuariosParaLogin();
    carregarHistorico();
    configurarRealtime();
});


// ==========================================
// CONSTRUÇÃO E RENDEREZAÇÃO DAS FILAS MÚLTIPLAS
// ==========================================

async function carregarEstruturaDasFilas() {
    // Traz todas as filas cadastradas no banco em ordem
    const { data: filas, error } = await db.from('filas').select('*').order('id', { ascending: true });
    
    if (error) {
        console.error("Erro ao carregar as filas:", error);
        return;
    }

    todasAsFilas = filas || [];
    
    const container = document.getElementById('filasContainer');
    if (!container) return;

    if (todasAsFilas.length === 0) {
        container.innerHTML = '<span style="color: #888; font-size: 0.9em;">Nenhuma fila cadastrada no banco.</span>';
        return;
    }

    // Cria um Card para cada Fila (Aneel, Nice, Anatel...)
    container.innerHTML = todasAsFilas.map(fila => `
        <section class="card fila-card" style="flex: 1; min-width: 180px;">
            <h2>${fila.nome}</h2>
            <div id="fila-${fila.id}" style="min-height: 80px; margin-bottom: 10px;"></div>
            <div class="acoes">
                <button id="btnFila-${fila.id}" onclick="toggleMinhaPosicao(${fila.id})" style="width: 100%;">Entrar na fila</button>
            </div>
        </section>
    `).join('');
}

async function carregarDados() {
    // Busca a lista de pessoas em TODAS as filas simultaneamente
    const { data: filaAtualData, error } = await db
        .from('fila_atual')
        .select('*, colaboradores(nome, cor)')
        .order('ordem', { ascending: false });

    if (error) return console.error("Erro ao carregar Fila:", error);

    const dadosGlobais = filaAtualData || [];

    // Para cada fila na tela, renderiza apenas quem está nela
    todasAsFilas.forEach(filaConfig => {
        const itensDestaFila = dadosGlobais.filter(item => item.fila_id === filaConfig.id);
        const elContainer = document.getElementById(`fila-${filaConfig.id}`);
        
        if (elContainer) {
            elContainer.innerHTML = itensDestaFila.map((item, index) => `
                <div class="usuario" style="margin-bottom: 5px;">
                    <span style="margin-right: 10px; color: #888; font-weight: bold;">${index + 1}º</span>
                    <span class="cor" style="background:${item.colaboradores?.cor || '#ccc'}"></span>
                    ${item.colaboradores?.nome || 'Desconhecido'}
                </div>
            `).join('');
        }

        // Atualiza o botão (Verde se entrar, Vermelho se já estiver na Fila X)
        const btn = document.getElementById(`btnFila-${filaConfig.id}`);
        if (btn) {
            if (usuario) {
                const estaNestaFila = itensDestaFila.some(i => i.colaborador_id === usuario.id);
                btn.innerText = estaNestaFila ? "Sair da fila" : "Entrar na fila";
                btn.style.background = estaNestaFila ? "#F44336" : "#00C853";
            } else {
                btn.innerText = "Entrar na fila";
                btn.style.background = "#00C853";
            }
        }
    });

    // Atualiza botão do cabeçalho
    const btnHeader = document.getElementById('btnLoginHeader');
    if (btnHeader) {
        if (usuario) {
            btnHeader.innerHTML = `<span>${usuario.nome}</span> <button onclick="logout()" style="margin-left:10px; background:#f44336; border:none; color:white; padding:4px 10px; border-radius:4px; cursor:pointer;">Logout</button>`;
            btnHeader.onclick = null;
        } else {
            btnHeader.innerText = "Entrar / Login";
            btnHeader.onclick = abrirLogin;
        }
    }
}

async function carregarListaForaDaFila() {
    const { data: todos } = await db.from('colaboradores').select('*');
    // Consulta todo mundo que está na fila atual (não importa qual fila seja)
    const { data: naFila } = await db.from('fila_atual').select('colaborador_id');
    
    const idsNaFila = naFila ? naFila.map(i => i.colaborador_id) : [];
    // Filtra: Só exibe embaixo quem NÃO estiver em nenhuma fila
    const foraDaFila = (todos || []).filter(c => !idsNaFila.includes(c.id));
    
    const container = document.getElementById('foraFila');
    container.innerHTML = foraDaFila.map(c => `
        <div class="usuario" style="display:inline-flex; align-items:center; margin-right: 15px; margin-bottom: 5px;">
            <span class="cor" style="background:${c.cor || '#ccc'}"></span>
            ${c.nome || 'Sem nome'}
        </div>
    `).join('');
}


// ==========================================
// AÇÕES DE ENTRAR E SAIR (AGORA EXIGE O ID DA FILA ESPECÍFICA)
// ==========================================

async function toggleMinhaPosicao(idFila) {
    if (!usuario) {
        abrirLogin();
        return;
    }

    const btn = document.getElementById(`btnFila-${idFila}`);
    if(btn) btn.disabled = true;

    try {
        const { data: naFila } = await db.from('fila_atual')
            .select('id')
            .eq('colaborador_id', usuario.id)
            .eq('fila_id', idFila);

        if (naFila && naFila.length > 0) {
            await sairDaFila(idFila); 
        } else {
            await entrarNaFila(idFila); 
        }
    } finally {
        if(btn) btn.disabled = false;
    }
}

async function entrarNaFila(idFila) {
    if (!usuario) return;

    // TRAVA ANTI-CLONE nesta fila específica
    const { data: checagem } = await db.from('fila_atual')
        .select('id')
        .eq('colaborador_id', usuario.id)
        .eq('fila_id', idFila);

    if (checagem && checagem.length > 0) {
        console.log("Bloqueado: Usuário já está nesta fila específica!");
        return; 
    }

    // 1. Descobre a próxima ordem
    const { data: ultimaFila } = await db.from('fila_atual')
        .select('ordem')
        .eq('fila_id', idFila)
        .order('ordem', { ascending: false })
        .limit(1);

    const novaOrdem = (ultimaFila && ultimaFila.length > 0) ? (ultimaFila[0].ordem + 1) : 1;

    // 2. Insere
    const { error } = await db.from('fila_atual').insert([
        { fila_id: idFila, colaborador_id: usuario.id, ordem: novaOrdem }
    ]);

    if (error) return alert("Erro ao entrar: " + error.message);
    
    registrarHistorico('entrou', idFila); 
    await atualizarCenarioCompleto();
}

async function sairDaFila(idFila) {
    if (!usuario) return;

    const { error } = await db.from('fila_atual')
        .delete()
        .eq('colaborador_id', usuario.id)
        .eq('fila_id', idFila);

    if (error) return alert("Erro ao sair: " + error.message);

    registrarHistorico('saiu', idFila);
    await atualizarCenarioCompleto();
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
}

async function salvarColaborador() {
    const inputNome = document.querySelector('#modalNovoColaborador #nomeColaboradorNovo');
    const inputCor = document.querySelector('#modalNovoColaborador #corColaboradorNovo');
    
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
        inputNome.value = ''; 
        fecharModal('modalNovoColaborador'); 
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

    const senhaPadraoTexto = colab.nome.toLowerCase() + '123';
    const hashDigitado = await criptografarSenha(senhaDigitada);
    const hashPadrao = await criptografarSenha(senhaPadraoTexto);

    const senhaValidaNoBanco = colab.senha ? colab.senha : hashPadrao;

    if (hashDigitado === senhaValidaNoBanco) {
        usuario = colab; 

        if (!colab.senha || hashDigitado === hashPadrao) {
            alert("Primeiro acesso! Por favor, defina uma nova senha.");
            document.getElementById('modalLogin').style.display = 'none';
            document.getElementById('modalAlterarSenha').style.display = 'flex';
        } else {
            localStorage.setItem('usuarioFila', JSON.stringify(colab));
            document.getElementById('modalLogin').style.display = 'none';
            await atualizarCenarioCompleto();
        }
    } else {
        alert("Senha incorreta!");
    }
}

async function salvarNovaSenha() {
    const novaSenha = document.getElementById('novaSenha').value;
    
    if (!novaSenha) return alert("Digite uma nova senha!");
    if (!usuario || !usuario.id) return alert("Erro de usuário. Refaça o login.");

    const senhaCriptografada = await criptografarSenha(novaSenha);

    const { error } = await db.from('colaboradores')
        .update({ senha: senhaCriptografada })
        .eq('id', usuario.id);

    if (error) return alert("Erro ao salvar senha no banco: " + error.message);

    alert("Senha alterada com sucesso!");
    usuario.senha = senhaCriptografada; 
    localStorage.setItem('usuarioFila', JSON.stringify(usuario));
    
    document.getElementById('modalAlterarSenha').style.display = 'none';
    await atualizarCenarioCompleto();
}

function logout() {
    localStorage.removeItem('usuarioFila');
    usuario = null;
    alert("Você saiu do sistema.");
    atualizarCenarioCompleto();
}


// ==========================================
// UTILITÁRIOS E HISTÓRICO
// ==========================================

async function registrarHistorico(acao, idFila) {
    if (!usuario) return;
    
    const { error } = await db.from('historico').insert([
        { fila_id: idFila, colaborador_id: usuario.id, acao }
    ]);
    
    if (!error) {
        await carregarHistorico(); 
    }
}

function abrirNovoColaborador(){
    document.getElementById("modalMenuAdmin").style.display="none";
    document.getElementById("modalNovoColaborador").style.display="flex";
}
function fecharModalAdmin(){
    document.getElementById("modalMenuAdmin").style.display="none";
}
function fecharModal(idModal) {
    document.getElementById(idModal).style.display = 'none';
}


// ==========================================
// FUNÇÕES DE EDIÇÃO DE COLABORADOR
// ==========================================
let listaColaboradoresEdicao = [];

async function abrirEditarColaborador() {
    fecharModal('modalMenuAdmin');
    document.getElementById('modalEditarColaborador').style.display = 'flex';

    const { data: colabs, error } = await db.from('colaboradores')
        .select('*')
        .order('nome', { ascending: true });
        
    if (error) return alert("Erro ao carregar colaboradores: " + error.message);

    listaColaboradoresEdicao = colabs; 

    const select = document.getElementById('selectEditarColaborador');
    select.innerHTML = '<option value="">Selecione um colaborador...</option>' + 
        colabs.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

    document.getElementById('nomeEditarColaborador').value = '';
    document.getElementById('corEditarColaborador').value = '#3498db';
}

function preencherDadosEdicao() {
    const idSelecionado = document.getElementById('selectEditarColaborador').value;
    const inputNome = document.getElementById('nomeEditarColaborador');
    const inputCor = document.getElementById('corEditarColaborador');
    
    if (!idSelecionado) {
        inputNome.value = '';
        inputCor.value = '#3498db';
        return;
    }

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

    if (!idSelecionado) return alert("Selecione um colaborador primeiro!");
    if (!nomeEditado) return alert("O nome não pode ficar vazio!");

    const { error } = await db.from('colaboradores')
        .update({ nome: nomeEditado, cor: corEditada })
        .eq('id', idSelecionado);

    if (error) {
        alert("Erro ao atualizar: " + error.message);
    } else {
        alert("Colaborador atualizado com sucesso!");
        fecharModal('modalEditarColaborador');
        await atualizarCenarioCompleto();
    }
}

// ==========================================
// FUNÇÕES DE REMOÇÃO DE COLABORADOR
// ==========================================
let idColaboradorParaRemover = null;

async function abrirRemoverColaborador() {
    fecharModal('modalMenuAdmin');
    document.getElementById('modalRemoverColaborador').style.display = 'flex';

    const { data: colabs, error } = await db.from('colaboradores')
        .select('id, nome')
        .order('nome', { ascending: false });
        
    if (error) return alert("Erro ao carregar colaboradores: " + error.message);

    const select = document.getElementById('selectRemoverColaborador');
    select.innerHTML = '<option value="">Selecione um colaborador...</option>' + 
        colabs.map(c => `<option value="${c.id}" data-nome="${c.nome}">${c.nome}</option>`).join('');
}

function abrirConfirmacaoRemocao() {
    const select = document.getElementById('selectRemoverColaborador');
    const idSelecionado = select.value;
    
    if (!idSelecionado) return alert("Selecione um colaborador primeiro!");

    const nomeSelecionado = select.options[select.selectedIndex].getAttribute('data-nome');
    idColaboradorParaRemover = idSelecionado;

    document.getElementById('textoConfirmacaoRemocao').innerHTML = `Você deseja realmente excluir o colaborador <strong>${nomeSelecionado}</strong>? Esta ação não pode ser desfeita.`;
    document.getElementById('modalRemoverColaborador').style.display = 'none';
    document.getElementById('modalConfirmarRemocao').style.display = 'flex';
}

function cancelarConfirmacaoRemocao() {
    idColaboradorParaRemover = null;
    document.getElementById('modalConfirmarRemocao').style.display = 'none';
    document.getElementById('modalRemoverColaborador').style.display = 'flex';
}

async function executarRemocao() {
    if (!idColaboradorParaRemover) return;

    const { error } = await db.from('colaboradores')
        .delete()
        .eq('id', idColaboradorParaRemover);

    if (error) {
        alert("Erro ao remover: " + error.message);
    } else {
        alert("Colaborador removido com sucesso!");
        fecharModal('modalConfirmarRemocao');
        idColaboradorParaRemover = null;
        
        if (usuario && usuario.id == idColaboradorParaRemover) {
            logout();
        } else {
            await atualizarCenarioCompleto();
        }
    }
}


async function carregarHistorico() {
    // Removemos a filtragem "eq('fila_id')" para ele puxar globalmente de qualqer fila!
    const { data: historico, error } = await db.from('historico')
        .select('*, colaboradores(nome, cor), filas(nome)')
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

    container.innerHTML = historico.map((item, index) => {
        const data = new Date(item.created_at);

        const hora = String(data.getHours()).padStart(2, '0');
        const minuto = String(data.getMinutes()).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');

        const dataFormatada = `${hora}:${minuto} | ${dia}/${mes}`;
        
        // Pega o nome da fila que veio na query do DB
        const nomeFila = item.filas?.nome ? `"${item.filas.nome.toLowerCase()}"` : '"desconhecida"';
        
        const acaoTexto = item.acao === 'entrou' ? `entrou na fila ${nomeFila}` : `saiu da fila ${nomeFila}`;
        const corAcao = item.acao === 'entrou' ? '#00C853' : '#F44336'; 

        const isMaisRecente = index === 0;
        const estiloFundo = isMaisRecente ? 'background: rgba(255, 255, 255, 0.1); border-left: 4px solid #f3f707; padding-left: 10px;' : '';
        const pesoFonte = isMaisRecente ? 'font-size: 1.01em;' : 'font-size: 0.7em; opacity: 0.7;';

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #333; ${estiloFundo} ${pesoFonte} transition: 0.3s;">
                <div>
                    <span class="cor" style="background:${item.colaboradores?.cor || '#ccc'}; width: 12px; height: 12px; display: inline-block; border-radius: 50%; margin-right: 8px;"></span>
                    <strong style="color: #fff;">${item.colaboradores?.nome || 'Desconhecido'}</strong> 
                    <span style="color: ${corAcao}; font-weight: bold; margin-left: 5px;display:flex;justify-content:space-between;">${acaoTexto}</span>
                </div>
                <div style="color: #f3f707; font-size: 0.85em; margin-left: 10px; white-space: nowrap;">
                     ${dataFormatada}
                </div>
            </div>
        `;
    }).join('');
}


async function verificarSessaoFantasma() {
    if (!usuario) return; 

    const { data: colab, error } = await db.from('colaboradores')
        .select('id')
        .eq('id', usuario.id)
        .single();

    if (error || !colab) {
        console.log("Usuário deletado detectado. Limpando sessão...");
        localStorage.removeItem('usuarioFila');
        usuario = null;
        alert("Sua sessão expirou ou seu usuário foi removido.");
        await atualizarCenarioCompleto();
    }
}

function configurarRealtime() {
    db.channel('schema-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'fila_atual' },
            (payload) => {
                console.log('Mudança na fila detectada!', payload);
                carregarDados(); 
                carregarListaForaDaFila(); 
            }
        )
       .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'historico' }, // Mudei para INSERT para garantir que só toque quando criar um novo registro
            (payload) => {
                console.log('Mudança no histórico detectada!', payload);
                
                // Descobre se a pessoa entrou ou saiu através dos dados que chegaram do banco
                const acao = payload.new.acao; 
                
                if (acao === 'entrou') {
                    somEntrar.play().catch(err => console.log("Áudio bloqueado até interação:", err));
                } else if (acao === 'saiu') {
                    somSair.play().catch(err => console.log("Áudio bloqueado até interação:", err));
                }
                
                carregarHistorico();
            }
        )
        .subscribe();
}

async function atualizarCenarioCompleto() {
    await carregarDados(); 
    await carregarListaForaDaFila(); 
    await carregarHistorico(); 
}

async function criptografarSenha(senha) {
    const msgBuffer = new TextEncoder().encode(senha);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
