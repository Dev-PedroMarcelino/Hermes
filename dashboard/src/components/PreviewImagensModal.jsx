import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  X, Sparkles, Layers, Cpu, CheckCircle2, Rocket, AlertCircle,
  Image as ImageIcon, RefreshCw, ZoomIn, ExternalLink, Globe, Palette, Film,
  ChevronRight, Search, Play, Volume2, Hash, Edit3
} from 'lucide-react';
import { generateImagePreview, searchSingleImage, getProxyImageUrl, triggerVideoJob } from '../lib/engineApi';

export default function PreviewImagensModal({
  onClose,
  initialTopic = '',
  initialInstruction = '',
  initialTenantId = ''
}) {
  const [canais, setCanais] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(initialTenantId || '');
  const [assunto, setAssunto] = useState(initialTopic || '');
  const [descricao, setDescricao] = useState(initialInstruction || '');
  const [mediaPreference, setMediaPreference] = useState('auto'); // auto, google_image, ai_image, pexels

  const [carregando, setCarregando] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [erro, setErro] = useState('');
  const [resultadoPreview, setResultadoPreview] = useState(null);

  // Active scene images state (allows individual scene image switching)
  const [activeImages, setActiveImages] = useState({}); // { [sceneIndex]: selectedUrl }
  const [sceneCustomQueries, setSceneCustomQueries] = useState({}); // { [sceneIndex]: customQueryText }
  const [sceneSearching, setSceneSearching] = useState({}); // { [sceneIndex]: boolean }
  const [sceneAlternatives, setSceneAlternatives] = useState({}); // { [sceneIndex]: [urls] }

  // Fullscreen Zoom Modal State
  const [zoomedImage, setZoomedImage] = useState(null);

  // Enqueue job state
  const [enfileirando, setEnfileirando] = useState(false);
  const [enfileiradoSucesso, setEnfileiradoSucesso] = useState(false);

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

  const handleBuscarImagens = async (e) => {
    if (e) e.preventDefault();
    if (!assunto.trim() || !selectedTenant) return;

    setCarregando(true);
    setErro('');
    setEnfileiradoSucesso(false);
    setLoadingStep('Gerando estrutura de cenas com Gemini...');

    try {
      setTimeout(() => setLoadingStep('Buscando e gerando imagens para cada cena...'), 2000);

      const preview = await generateImagePreview({
        tenantId: selectedTenant,
        topic: assunto.trim(),
        instruction: descricao.trim() || null,
        mediaPreference
      });

      setResultadoPreview(preview);

      // Initialize active images map
      const initialMap = {};
      const initialAlts = {};
      (preview.scenes || []).forEach((scene, idx) => {
        initialMap[idx] = scene.imageUrl;
        initialAlts[idx] = [scene.imageUrl, ...(scene.alternativeUrls || [])].filter(Boolean);
      });
      setActiveImages(initialMap);
      setSceneAlternatives(initialAlts);
    } catch (err) {
      console.error('Erro ao buscar imagens:', err);
      setErro(err.message || 'Falha ao buscar imagens de prévia.');
    } finally {
      setCarregando(false);
      setLoadingStep('');
    }
  };

  // Re-search a single scene
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

  // Enqueue full video with this validated theme
  const handleAprovarECriarVideo = async () => {
    if (!assunto.trim() || !selectedTenant) return;

    setEnfileirando(true);
    setErro('');
    try {
      await triggerVideoJob({
        tenantId: selectedTenant,
        customTopic: assunto.trim(),
        customInstruction: descricao.trim() || null
      });

      setEnfileiradoSucesso(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setErro(err.message || 'Falha ao enfileirar vídeo.');
    } finally {
      setEnfileirando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(4, 7, 13, 0.94)',
      backdropFilter: 'blur(20px)',
      zIndex: 1200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      overflowY: 'auto'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '1180px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '20px',
        border: '1px solid rgba(0, 255, 135, 0.4)',
        boxShadow: '0 25px 80px rgba(0, 255, 135, 0.2)',
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
              background: 'linear-gradient(135deg, #00ff87, #60efff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(0, 255, 135, 0.4)'
            }}>
              <ImageIcon size={24} color="#06090c" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Prévia de Imagens da IA</h3>
                <span className="badge badge-active" style={{ fontSize: '10px' }}>SEM RENDERIZAR VÍDEO</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Valide e teste as escolhas visuais de cada cena antes de colocar o vídeo na esteira
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
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com Rolagem Interna */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Formulário de Configuração da Busca */}
          <form onSubmit={handleBuscarImagens} style={{
            background: 'rgba(11, 16, 26, 0.8)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div className="grid-responsive-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Layers size={14} className="text-accent" /> Canal Destino (Tenant)
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
                  placeholder="Ex: Mistérios Secretos da Antártida ou GTA 6 Notícias"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Cpu size={14} className="text-accent" /> Descrição / Direção Visual para a IA
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Focar em paisagens misteriosas, fotos de expedições antigas e mapas de satélite..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            {/* Seletor de Tipo de Fonte de Imagem */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Fonte Visual:</span>
                
                {[
                  { id: 'auto', label: '⚡ Automático / Misto', icon: Sparkles },
                  { id: 'google_image', label: '🌐 Fotos Reais Web (Google/Bing)', icon: Globe },
                  { id: 'ai_image', label: '🎨 Arte IA (Pollinations Flux 9:16)', icon: Palette },
                  { id: 'pexels', label: '🎬 Stock Pexels', icon: Film }
                ].map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = mediaPreference === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setMediaPreference(mode.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(0, 255, 135, 0.15)' : 'rgba(255,255,255,0.03)',
                        border: isSelected ? '1px solid #00ff87' : '1px solid var(--border-color)',
                        color: isSelected ? '#00ff87' : 'var(--text-secondary)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Icon size={13} /> {mode.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="submit"
                className="gradient-btn"
                disabled={carregando || !assunto.trim()}
                style={{
                  padding: '10px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 700
                }}
              >
                {carregando ? (
                  <>
                    <RefreshCw size={16} style={{ animation: 'spin 1.5s linear infinite' }} />
                    Buscando Imagens...
                  </>
                ) : (
                  <>
                    <Search size={16} /> Buscar / Gerar Imagens
                  </>
                )}
              </button>
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

          {/* Estado de Carregando com Barra de Progresso */}
          {carregando && (
            <div className="glass-panel tech-card" style={{
              padding: '36px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px'
            }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: 'rgba(0, 255, 135, 0.1)',
                border: '2px solid #00ff87',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <RefreshCw size={28} className="text-accent" style={{ animation: 'spin 1.2s linear infinite' }} />
              </div>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#00ff87' }}>
                  {loadingStep || 'Processando com IA...'}
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  O Gemini está estruturando as cenas e coletando as fotos com queries otimizadas em alta resolução.
                </p>
              </div>
            </div>
          )}

          {/* RESULTADO: VISÃO GERAL & GALERIA DE CENAS */}
          {resultadoPreview && !carregando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Card Resumo do Roteiro */}
              <div className="glass-panel" style={{
                padding: '20px',
                borderRadius: '16px',
                border: '1px solid rgba(0, 255, 135, 0.25)',
                background: 'rgba(6, 12, 20, 0.85)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#00ff87', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Tema Principal: {resultadoPreview.mainVisualTheme}
                    </span>
                    <h4 style={{ fontSize: '17px', fontWeight: 800, marginTop: '2px' }}>
                      "{resultadoPreview.title}"
                    </h4>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={handleAprovarECriarVideo}
                      disabled={enfileirando || enfileiradoSucesso}
                      className="gradient-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        fontSize: '13px',
                        fontWeight: 800
                      }}
                    >
                      <Rocket size={16} />
                      {enfileirando ? 'Enfileirando...' : enfileiradoSucesso ? '✓ Enviado para Produção!' : 'Aprovar e Criar Vídeo Completo'}
                    </button>
                  </div>
                </div>

                <div style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'rgba(0, 255, 135, 0.05)',
                  border: '1px solid rgba(0, 255, 135, 0.15)',
                  fontSize: '13px',
                  lineHeight: '1.5'
                }}>
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
                    <ImageIcon size={13} className="text-accent" /> {resultadoPreview.scenes?.length || 0} cenas com imagens
                  </span>
                </div>
              </div>

              {/* Grid de Cenas com Imagens em 9:16 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '20px'
              }}>
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
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Topo do Card da Cena */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          color: '#00ff87',
                          background: 'rgba(0, 255, 135, 0.1)',
                          padding: '4px 8px',
                          borderRadius: '6px'
                        }}>
                          Cena {idx + 1} (~{scene.durationEstSeconds || 6}s)
                        </span>

                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase'
                        }}>
                          {scene.source === 'ai_image' ? '🎨 IA Flux' : scene.source === 'pexels' ? '🎬 Pexels' : '🌐 Web Real'}
                        </span>
                      </div>

                      {/* Imagem Principal da Cena com Aspect Ratio Vertical */}
                      <div style={{
                        position: 'relative',
                        width: '100%',
                        height: '300px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.08)'
                      }}>
                        {currentImgUrl ? (
                          <img
                            src={getProxyImageUrl(currentImgUrl)}
                            alt={`Cena ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              transition: 'transform 0.3s ease'
                            }}
                            onError={(e) => {
                              // Fallback direct URL if proxy fails or vice versa
                              if (!e.target.dataset.triedFallback) {
                                e.target.dataset.triedFallback = 'true';
                                e.target.src = currentImgUrl;
                              }
                            }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                            Sem imagem
                          </div>
                        )}

                        {/* Overlay com Botões de Ação na Imagem */}
                        <div style={{
                          position: 'absolute',
                          bottom: 0, left: 0, right: 0,
                          padding: '10px',
                          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <button
                            type="button"
                            onClick={() => setZoomedImage(currentImgUrl)}
                            className="btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.6)' }}
                            title="Ampliar Imagem"
                          >
                            <ZoomIn size={12} /> Ampliar
                          </button>

                          <a
                            href={currentImgUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: '#fff',
                              background: 'rgba(0,0,0,0.6)',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: '11px'
                            }}
                            title="Abrir URL original"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>

                      {/* Texto Narrado da Cena */}
                      <div style={{
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        lineHeight: '1.4',
                        background: 'rgba(255,255,255,0.02)',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        borderLeft: '2px solid #00ff87'
                      }}>
                        "{scene.text}"
                      </div>

                      {/* Miniaturas de Opções Alternativas */}
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                          Alternativas para esta cena:
                        </span>
                        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                          {alternatives.map((altUrl, altIdx) => {
                            const isSelected = currentImgUrl === altUrl;
                            return (
                              <div
                                key={altIdx}
                                onClick={() => setActiveImages(prev => ({ ...prev, [idx]: altUrl }))}
                                style={{
                                  width: '52px',
                                  height: '70px',
                                  flexShrink: 0,
                                  borderRadius: '6px',
                                  overflow: 'hidden',
                                  cursor: 'pointer',
                                  border: isSelected ? '2px solid #00ff87' : '1px solid var(--border-color)',
                                  boxShadow: isSelected ? '0 0 10px rgba(0, 255, 135, 0.5)' : 'none',
                                  opacity: isSelected ? 1 : 0.6,
                                  transition: 'all 0.2s ease'
                                }}
                                title={`Escolher Opção ${altIdx + 1}`}
                              >
                                <img
                                  src={getProxyImageUrl(altUrl)}
                                  alt={`Opção ${altIdx + 1}`}
                                  referrerPolicy="no-referrer"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Busca Manual Rápida para Esta Cena Específica */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', paddingTop: '6px' }}>
                        <input
                          type="text"
                          className="input-field"
                          placeholder={scene.visualSearchQuery || 'Buscar foto...'}
                          style={{ padding: '6px 10px', fontSize: '11px', flex: 1 }}
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
                          style={{ padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          title="Buscar imagem para esta cena"
                        >
                          {isSearchingThis ? (
                            <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                          ) : (
                            <Search size={12} />
                          )}
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
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color)',
          background: 'rgba(10, 15, 24, 0.95)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: '10px 18px', fontSize: '13px' }}
          >
            Fechar
          </button>

          {resultadoPreview && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={handleBuscarImagens}
                disabled={carregando}
                className="btn-secondary"
                style={{ padding: '10px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} /> Gerar Novas Opções
              </button>

              <button
                type="button"
                onClick={handleAprovarECriarVideo}
                disabled={enfileirando || enfileiradoSucesso}
                className="gradient-btn"
                style={{ padding: '10px 24px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}
              >
                <Rocket size={16} />
                {enfileirando ? 'Enfileirando...' : enfileiradoSucesso ? '✓ Vídeo Enviado!' : 'Aprovar e Criar Vídeo'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Zoom em Tela Cheia */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            zIndex: 1400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxHeight: '90vh',
              maxWidth: '90vw',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <img
              src={getProxyImageUrl(zoomedImage)}
              alt="Zoomed preview"
              referrerPolicy="no-referrer"
              style={{
                maxHeight: '82vh',
                maxWidth: '90vw',
                borderRadius: '16px',
                boxShadow: '0 0 40px rgba(0, 255, 135, 0.3)',
                border: '1px solid rgba(0, 255, 135, 0.5)'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <a
                href={zoomedImage}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ExternalLink size={14} /> Abrir em Alta Resolução
              </a>

              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="gradient-btn"
                style={{ padding: '8px 20px', fontSize: '12px' }}
              >
                Fechar Zoom
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
