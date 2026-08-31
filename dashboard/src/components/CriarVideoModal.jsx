import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  X, Sparkles, Layers, Cpu, CheckCircle2, Rocket, AlertCircle,
  Image as ImageIcon, RefreshCw, ZoomIn, ExternalLink, Globe, Palette, Film,
  Search, Volume2, Hash, Plus
} from 'lucide-react';
import { generateImagePreview, searchSingleImage, getProxyImageUrl, triggerVideoJob } from '../lib/engineApi';

export default function CriarVideoModal({
  onClose,
  onCreated,
  initialTopic = '',
  initialInstruction = '',
  initialTenantId = ''
}) {
  const [canais, setCanais] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(initialTenantId || '');
  const [assunto, setAssunto] = useState(initialTopic || '');
  const [descricao, setDescricao] = useState(initialInstruction || '');
  const [mediaPreference, setMediaPreference] = useState('web_video'); // web_video, google_image, ai_image, pexels

  // Configuração de Minissérie
  const [isMiniseries, setIsMiniseries] = useState(false);
  const [quantidadePartes, setQuantidadePartes] = useState('3');

  // Estados de Busca de Prévia de Imagens
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [resultadoPreview, setResultadoPreview] = useState(null);

  // Estados de Imagens por Cena (Troca e busca individual)
  const [activeImages, setActiveImages] = useState({});
  const [sceneCustomQueries, setSceneCustomQueries] = useState({});
  const [sceneSearching, setSceneSearching] = useState({});
  const [sceneAlternatives, setSceneAlternatives] = useState({});
  const [zoomedImage, setZoomedImage] = useState(null);

  // Estados de Criação do Job
  const [criando, setCriando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tenants'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCanais(lista);
      if (lista.length > 0 && !selectedTenant) {
        setSelectedTenant(lista[0].id);
      }
    }, (err) => console.warn('Erro ao carregar canais:', err.message));

    return () => unsubscribe();
  }, []);

  // Busca prévia de cenas e imagens com Gemini + Motores de Imagem
  const handleBuscarPreviewImagens = async (e) => {
    if (e) e.preventDefault();
    if (!assunto.trim() || !selectedTenant) return;

    setCarregandoPreview(true);
    setErro('');
    setSucesso(false);
    setLoadingStep('Gerando estrutura de cenas com o Gemini...');

    try {
      setTimeout(() => setLoadingStep('Buscando e gerando imagens para cada cena...'), 2000);

      const preview = await generateImagePreview({
        tenantId: selectedTenant,
        topic: assunto.trim(),
        instruction: descricao.trim() || null,
        mediaPreference
      });

      setResultadoPreview(preview);

      const initialMap = {};
      const initialAlts = {};
      (preview.scenes || []).forEach((scene, idx) => {
        initialMap[idx] = scene.imageUrl;
        initialAlts[idx] = [scene.imageUrl, ...(scene.alternativeUrls || [])].filter(Boolean);
      });
      setActiveImages(initialMap);
      setSceneAlternatives(initialAlts);
    } catch (err) {
      console.error('Erro ao buscar prévia de imagens:', err);
      setErro(err.message || 'Falha ao gerar prévia de imagens.');
    } finally {
      setCarregandoPreview(false);
      setLoadingStep('');
    }
  };

  // Re-busca de imagem para uma cena específica
  const handleBuscarCenaIndividual = async (sceneIndex, scene) => {
    const customQuery = sceneCustomQueries[sceneIndex] || scene.visualSearchQuery || scene.imagePrompt;
    if (!customQuery || !customQuery.trim()) return;

    setSceneSearching(prev => ({ ...prev, [sceneIndex]: true }));
    try {
      const singleRes = await searchSingleImage({
        query: customQuery.trim(),
        prompt: customQuery.trim(),
        source: mediaPreference === 'auto' ? 'google_image' : mediaPreference,
        tenantId: selectedTenant
      });

      if (singleRes.imageUrl) {
        setActiveImages(prev => ({ ...prev, [sceneIndex]: singleRes.imageUrl }));
        const allNew = [singleRes.imageUrl, ...(singleRes.alternativeUrls || [])].filter(Boolean);
        setSceneAlternatives(prev => ({ ...prev, [sceneIndex]: allNew }));
      }
    } catch (err) {
      console.warn(`Erro na busca da cena ${sceneIndex + 1}:`, err.message);
    } finally {
      setSceneSearching(prev => ({ ...prev, [sceneIndex]: false }));
    }
  };

  // Dispara a criação final do vídeo na esteira de produção
  const handleCriarVideo = async (e) => {
    if (e) e.preventDefault();
    if (!assunto.trim() || !selectedTenant) return;

    setCriando(true);
    setSucesso(false);
    setErro('');

    try {
      if (isMiniseries) {
        const numPartes = parseInt(quantidadePartes, 10);

        for (let i = 1; i <= numPartes; i++) {
          const isLast = i === numPartes;
          const serieInstruction = [
            `Este é o episódio ${i} de uma minissérie de ${numPartes} partes sobre "${assunto.trim()}".`,
            `Inclua "Parte ${i}" no título.`,
            isLast
              ? 'Encerre a história com uma conclusão satisfatória e um convite para seguir o canal.'
              : `Termine obrigatoriamente com um cliffhanger dramático chamando o público para a Parte ${i + 1}.`,
            descricao.trim()
          ].filter(Boolean).join(' ');

          await triggerVideoJob({
            tenantId: selectedTenant,
            customTopic: assunto.trim(),
            customInstruction: serieInstruction,
            mediaTypePreference: mediaPreference
          });
        }
      } else {
        await triggerVideoJob({
          tenantId: selectedTenant,
          customTopic: assunto.trim(),
          customInstruction: descricao.trim() || null,
          mediaTypePreference: mediaPreference
        });
      }

      setSucesso(true);
      if (onCreated) onCreated();
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCriando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(4, 7, 13, 0.93)',
      backdropFilter: 'blur(18px)',
      zIndex: 1200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      overflowY: 'auto'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '1100px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '20px',
        border: '1px solid rgba(0, 255, 135, 0.4)',
        boxShadow: '0 25px 80px rgba(0, 255, 135, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Header do Modal */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(10, 15, 24, 0.95)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #00ff87, #14a76c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(0, 255, 135, 0.35)'
            }}>
              <Plus size={24} color="#06090c" />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Criar Novo Vídeo pela IA</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Defina o tema, veja a prévia de imagens das cenas e envie para a esteira
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-color)',
              color: '#fff',
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo com Rolagem */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Formulário Principal */}
          <form onSubmit={handleCriarVideo} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="grid-responsive-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Layers size={14} className="text-accent" /> Canal Destino
                </label>
                <select
                  className="input-field"
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  required
                >
                  {canais.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.nome} ({c.niche || c.nicho})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Sparkles size={14} className="text-accent" /> Assunto / Tema do Vídeo
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: A Descoberta Secreta sob a Antártida"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Cpu size={14} className="text-accent" /> Descrição / Instrução Direta para a IA
              </label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="Descreva detalhadamente como a IA deve criar o roteiro e o estilo visual..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            {/* Fonte Visual & Minissérie */}
            <div className="grid-responsive-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              
              {/* Fonte Visual */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '14px', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                  Fonte das Imagens de Fundo:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'web_video', label: '🌐 Vídeos da Web (≤10s)', icon: Film },
                    { id: 'google_image', label: '📷 Fotos Reais Web', icon: Globe },
                    { id: 'ai_image', label: '🎨 Arte IA (Flux)', icon: Palette },
                    { id: 'pexels', label: '🎬 Stock Pexels', icon: Sparkles }
                  ].map((mode) => {
                    const Icon = mode.icon;
                    const isSelected = mediaPreference === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setMediaPreference(mode.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(0, 255, 135, 0.15)' : 'rgba(255,255,255,0.03)',
                          border: isSelected ? '1px solid #00ff87' : '1px solid var(--border-color)',
                          color: isSelected ? '#00ff87' : 'var(--text-secondary)'
                        }}
                      >
                        <Icon size={13} /> {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Opção de Minissérie */}
              <div style={{
                background: 'rgba(0, 255, 135, 0.04)',
                border: '1px solid rgba(0, 255, 135, 0.2)',
                padding: '14px',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '10px'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isMiniseries}
                    onChange={(e) => setIsMiniseries(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--accent-green)' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#00ff87' }}>
                    Dividir em Minissérie (Partes com Cliffhangers)
                  </span>
                </label>

                {isMiniseries && (
                  <select
                    className="input-field"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                    value={quantidadePartes}
                    onChange={(e) => setQuantidadePartes(e.target.value)}
                  >
                    <option value="2">2 Partes</option>
                    <option value="3">3 Partes</option>
                    <option value="5">5 Partes</option>
                  </select>
                )}
              </div>

            </div>

            {/* Banner de Ações do Formulário */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginTop: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleBuscarPreviewImagens}
                  disabled={carregandoPreview || !assunto.trim()}
                  className="btn-secondary"
                  style={{
                    padding: '10px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: '1px solid rgba(0, 255, 135, 0.4)',
                    color: '#00ff87',
                    background: 'rgba(0, 255, 135, 0.08)',
                    fontSize: '13px',
                    fontWeight: 700
                  }}
                >
                  {carregandoPreview ? (
                    <>
                      <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                      Buscando Prévia...
                    </>
                  ) : (
                    <>
                      <ImageIcon size={16} /> Ver Prévia de Imagens
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  className="gradient-btn"
                  disabled={criando || !assunto.trim()}
                  style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800 }}
                >
                  <Rocket size={16} /> {criando ? 'Enfileirando...' : 'OK - Iniciar Vídeo Direto'}
                </button>
              </div>

              {sucesso && (
                <span style={{ color: '#00ff87', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={18} /> Enviado para a Esteira da IA!
                </span>
              )}
            </div>
          </form>

          {/* Erro Banner */}
          {erro && (
            <div style={{
              background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.35)',
              padding: '14px 16px', borderRadius: '12px', display: 'flex', gap: '10px', alignItems: 'center'
            }}>
              <AlertCircle size={20} style={{ color: '#ff4757', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#ff9aa5' }}>{erro}</span>
            </div>
          )}

          {/* Estado de Carregamento da Prévia */}
          {carregandoPreview && (
            <div className="glass-panel tech-card" style={{
              padding: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px'
            }}>
              <RefreshCw size={32} className="text-accent" style={{ animation: 'spin 1.2s linear infinite' }} />
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#00ff87' }}>{loadingStep || 'Processando com IA...'}</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  O Gemini está estruturando as cenas e buscando fotos reais em alta resolução.
                </p>
              </div>
            </div>
          )}

          {/* RESULTADO DA PRÉVIA DE IMAGENS */}
          {resultadoPreview && !carregandoPreview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '10px' }}>
              
              {/* Card Resumo do Roteiro */}
              <div className="glass-panel" style={{
                padding: '18px', borderRadius: '16px', border: '1px solid rgba(0, 255, 135, 0.3)', background: 'rgba(6, 12, 20, 0.9)', display: 'flex', flexDirection: 'column', gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#00ff87', textTransform: 'uppercase' }}>
                      Tema Principal: {resultadoPreview.mainVisualTheme}
                    </span>
                    <h4 style={{ fontSize: '17px', fontWeight: 800, marginTop: '2px' }}>
                      "{resultadoPreview.title}"
                    </h4>
                  </div>

                  <button
                    onClick={handleCriarVideo}
                    disabled={criando || sucesso}
                    className="gradient-btn"
                    style={{ padding: '8px 18px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}
                  >
                    <Rocket size={14} /> {criando ? 'Enfileirando...' : sucesso ? '✓ Enviado!' : 'Aprovar e Criar Vídeo com estas Imagens'}
                  </button>
                </div>

                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(0, 255, 135, 0.05)', border: '1px solid rgba(0, 255, 135, 0.15)', fontSize: '12px' }}>
                  <strong style={{ color: '#00ff87' }}>Gancho Inicial (0 a 3s):</strong> "{resultadoPreview.hook}"
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Volume2 size={13} className="text-accent" /> Mood: {resultadoPreview.soundMood}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Hash size={13} className="text-accent" /> {resultadoPreview.hashtags?.join(' ')}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ImageIcon size={13} className="text-accent" /> {resultadoPreview.scenes?.length || 0} cenas preparadas
                  </span>
                </div>
              </div>

              {/* Grid de Cenas com Imagens em 9:16 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                {(resultadoPreview.scenes || []).map((scene, idx) => {
                  const currentImgUrl = activeImages[idx] || scene.imageUrl;
                  const alternatives = sceneAlternatives[idx] || [scene.imageUrl, ...(scene.alternativeUrls || [])];
                  const isSearchingThis = sceneSearching[idx];

                  return (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(9, 14, 22, 0.95)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '14px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#00ff87', background: 'rgba(0, 255, 135, 0.1)', padding: '3px 6px', borderRadius: '4px' }}>
                          Cena {idx + 1} (~{scene.durationEstSeconds || 6}s)
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {scene.source === 'web_video' || scene.isVideo ? '🌐 Vídeo Web (≤10s)' : scene.source === 'ai_image' ? '🎨 IA Flux' : scene.source === 'pexels' ? '🎬 Pexels' : '📷 Foto Real'}
                        </span>
                      </div>

                      {/* Imagem Vertical 9:16 */}
                      <div style={{ position: 'relative', width: '100%', height: '280px', borderRadius: '10px', overflow: 'hidden', background: '#000' }}>
                        {currentImgUrl ? (
                          <img
                            src={getProxyImageUrl(currentImgUrl)}
                            alt={`Cena ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              if (!e.target.dataset.triedFallback) {
                                e.target.dataset.triedFallback = 'true';
                                e.target.src = currentImgUrl;
                              }
                            }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                            Sem imagem
                          </div>
                        )}

                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px', background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)', display: 'flex', justifyContent: 'space-between' }}>
                          <button
                            type="button"
                            onClick={() => setZoomedImage(currentImgUrl)}
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <ZoomIn size={11} /> Ampliar
                          </button>

                          <a href={currentImgUrl} target="_blank" rel="noreferrer" style={{ color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '4px 6px', borderRadius: '4px' }}>
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      </div>

                      <div style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: '1.4', background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '6px', borderLeft: '2px solid #00ff87' }}>
                        "{scene.text}"
                      </div>

                      {/* Alternativas */}
                      <div>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Alternativas:
                        </span>
                        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                          {alternatives.map((altUrl, altIdx) => {
                            const isSelected = currentImgUrl === altUrl;
                            return (
                              <div
                                key={altIdx}
                                onClick={() => setActiveImages(prev => ({ ...prev, [idx]: altUrl }))}
                                style={{
                                  width: '46px', height: '62px', flexShrink: 0, borderRadius: '4px', overflow: 'hidden', cursor: 'pointer',
                                  border: isSelected ? '2px solid #00ff87' : '1px solid var(--border-color)', opacity: isSelected ? 1 : 0.6
                                }}
                              >
                                <img src={getProxyImageUrl(altUrl)} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Busca Individual por Cena */}
                      <div style={{ display: 'flex', gap: '4px', marginTop: 'auto' }}>
                        <input
                          type="text"
                          className="input-field"
                          placeholder={scene.visualSearchQuery || 'Buscar foto...'}
                          style={{ padding: '4px 8px', fontSize: '10px', flex: 1 }}
                          value={sceneCustomQueries[idx] ?? ''}
                          onChange={(e) => setSceneCustomQueries(prev => ({ ...prev, [idx]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleBuscarCenaIndividual(idx, scene);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleBuscarCenaIndividual(idx, scene)}
                          disabled={isSearchingThis}
                          className="btn-secondary"
                          style={{ padding: '4px 8px' }}
                        >
                          {isSearchingThis ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={11} />}
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </div>

        {/* Rodapé do Modal */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border-color)', background: 'rgba(10, 15, 24, 0.95)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <button type="button" onClick={onClose} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '12px' }}>
            Fechar
          </button>

          {resultadoPreview && (
            <button
              type="button"
              onClick={handleCriarVideo}
              disabled={criando || sucesso}
              className="gradient-btn"
              style={{ padding: '10px 22px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}
            >
              <Rocket size={16} /> {criando ? 'Enfileirando...' : sucesso ? '✓ Vídeo Enviado!' : 'Aprovar e Criar Vídeo'}
            </button>
          )}
        </div>
      </div>

      {/* Modal Zoom */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.95)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <img
              src={getProxyImageUrl(zoomedImage)}
              alt="Zoomed"
              referrerPolicy="no-referrer"
              style={{ maxHeight: '82vh', maxWidth: '90vw', borderRadius: '12px', border: '1px solid #00ff87' }}
            />
            <button type="button" onClick={() => setZoomedImage(null)} className="gradient-btn" style={{ padding: '6px 18px', fontSize: '12px' }}>
              Fechar Zoom
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
