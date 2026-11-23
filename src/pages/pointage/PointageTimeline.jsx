import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Clock, CheckCircle, XCircle, AlertTriangle, User, Users, 
  ChevronDown, ChevronUp, Filter, Calendar, BarChart, Smartphone, Laptop
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { Tooltip } from '@/components/ui/tooltip';
import { TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PointageTimeline = ({ currentTime, creneaux, guichetieresPlanifiees, pointagesData, currentCreneauIndex }) => {
  const [viewMode, setViewMode] = useState('timeline');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCreneau, setSelectedCreneau] = useState(currentCreneauIndex !== -1 ? currentCreneauIndex : null);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 1024;

  // Suivre la largeur de l'écran pour l'adaptation responsive
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const totalDuration = 10 * 60; // 9h à 19h = 10 heures = 600 minutes

  const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours - 9) * 60 + minutes; // Minutes since 9:00 AM
  };

  const currentMinutes = (currentTime.getHours() - 9) * 60 + currentTime.getMinutes();
  const progressPercent = Math.max(0, Math.min(100, (currentMinutes / totalDuration) * 100));

  const getGuichetiereStatusForCreneau = (guichetiereMatricule, creneauIdx) => {
    const userPointagesToday = (pointagesData[guichetiereMatricule] || []);
    return userPointagesToday.find(p => p.creneauIndex === creneauIdx);
  };

  const getInitials = (prenom, nom) => {
    return (prenom?.charAt(0) || '') + (nom?.charAt(0) || '');
  };

  const getRandomColor = (matricule) => {
    // Génère une couleur aléatoire mais consistante basée sur le matricule
    const colors = [
      'bg-primary text-primary-foreground', 'bg-success text-success-foreground', 
      'bg-highlight text-highlight-foreground', 'bg-info text-info-foreground',
      'bg-warning text-warning-foreground', 'bg-secondary text-secondary-foreground'
    ];
    
    // Hash simple du matricule pour avoir toujours la même couleur
    let hash = 0;
    for (let i = 0; i < matricule?.length || 0; i++) {
      hash = matricule.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  };

  // Préparer les données des guichetières avec leurs pointages
  const guichetieresData = guichetieresPlanifiees.map(g => {
    const allPointages = pointagesData[g.matricule] || [];
    
    // Statut global
    const totalPointagesEffectues = allPointages.length;
    const totalCreneaux = creneaux.length;
    const pointagesComplets = totalPointagesEffectues >= totalCreneaux;
    
    // Détails par créneau
    const detailsParCreneau = creneaux.map((creneau, index) => {
      const pointage = getGuichetiereStatusForCreneau(g.matricule, index);
      const heurePointage = pointage?.time && isValid(new Date(pointage.time)) 
        ? format(new Date(pointage.time), 'HH:mm')
        : null;
      
      const isPast = timeToMinutes(creneau.fin) < currentMinutes;
      const isActive = index === currentCreneauIndex;
      
      return {
        creneauIndex: index,
        debut: creneau.debut,
        fin: creneau.fin,
        pointage: pointage,
        heurePointage: heurePointage,
        status: heurePointage ? 'pointed' : isActive ? 'active' : isPast ? 'missed' : 'upcoming'
      };
    });
    
    return {
      ...g,
      totalPointages: totalPointagesEffectues,
      totalCreneaux: totalCreneaux,
      isComplete: pointagesComplets,
      progress: totalCreneaux > 0 ? (totalPointagesEffectues / totalCreneaux) * 100 : 0,
      avatarColor: getRandomColor(g.matricule),
      initials: getInitials(g.prenom, g.nom),
      detailsParCreneau: detailsParCreneau
    };
  });

  const renderTimelineView = () => (
    <div className="w-full pt-2">
      {/* Barre de progression avec l'heure actuelle */}
      <div className="relative h-6 sm:h-8 mb-6 sm:mb-8 bg-muted rounded-full overflow-hidden">
          <div 
            className="absolute top-0 left-0 h-full bg-primary transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        
        {/* Marqueurs de créneaux - cachés sur mobile */}
        {!isMobile && creneaux.map((creneau, idx) => {
            const debutPercent = (timeToMinutes(creneau.debut) / totalDuration) * 100;
            const finPercent = (timeToMinutes(creneau.fin) / totalDuration) * 100;
          const isActive = idx === currentCreneauIndex;

            return (
            <div key={idx} className="absolute top-0 h-full">
              {/* Séparateur de début */}
              <div 
                className={`absolute h-full border-l-2 ${isActive ? 'border-warning' : 'border-primary/40'}`} 
                style={{ left: `${debutPercent}%` }}
              />
              {/* Numéro de créneau */}
              <div 
                className="absolute -top-5 sm:-top-6 text-xs font-semibold px-1 py-0.5 rounded bg-primary text-primary-foreground"
                style={{ left: `${debutPercent + ((finPercent - debutPercent) / 2) - 1.5}%` }}
              >
                {idx + 1}
              </div>
              {/* Séparateur de fin */}
              <div 
                className={`absolute h-full border-r-2 ${isActive ? 'border-warning' : 'border-primary/40'}`}
                style={{ left: `${finPercent}%` }}
              />
            </div>
            );
          })}
        
        {/* Marqueur d'heure actuelle */}
          <div 
          className="absolute top-0 h-full w-1 bg-destructive z-20"
          style={{ left: `${progressPercent}%` }}
          />
        </div>
      
      {/* Échelle de temps - version responsive */}
      <div className="flex justify-between text-xs  text-muted-foreground mb-6">
          <span>09:00</span>
        {!isMobile && <span>11:00</span>}
          <span>13:00</span>
        {!isMobile && <span>15:00</span>}
          <span>17:00</span>
        {!isMobile && <span>19:00</span>}
      </div>
      
      {/* Cartes des guichetières avec leurs pointages */}
      <div className="space-y-3 sm:space-y-4">
        {guichetieresData.map((guichetiere) => (
          <motion.div
            key={guichetiere.matricule}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-background/70 rounded-lg shadow-sm overflow-hidden"
          >
            {/* En-tête avec infos guichetière - adapté pour mobile */}
            <div className="flex items-center p-2 sm:p-3 border-b">
              <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full font-medium ${guichetiere.avatarColor}`}>
                {guichetiere.initials}
              </div>
              <div className="ml-2 sm:ml-3 flex-grow min-w-0">
                <h3 className="font-medium text-xs sm:text-sm truncate">{guichetiere.prenom} {guichetiere.nom}</h3>
                <div className="flex items-center text-xs  text-muted-foreground">
                  <span className="mr-1">{guichetiere.totalPointages}/{guichetiere.totalCreneaux}</span>
                  <div className="w-16 sm:w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div 
                      className={`h-full ${guichetiere.isComplete ? 'bg-success' : 'bg-primary'}`} 
                      style={{ width: `${guichetiere.progress}%` }}
                    />
                  </div>
                </div>
              </div>
              {guichetiere.isComplete ? (
                <div className="ml-auto flex items-center text-success text-xs  font-medium">
                  <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" /> 
                  {!isMobile && "Complet"}
                </div>
              ) : (
                <div className="ml-auto text-muted-foreground text-xs ">
                  {guichetiere.totalPointages > 0 ? 'En cours' : 'Attente'}
                </div>
              )}
        </div>

            {/* Ligne de temps des pointages - simplifiée sur mobile */}
            <div className="relative h-10 sm:h-14 px-2 pb-2">
              {/* Barre de fond */}
              <div className="absolute top-5 sm:top-6 left-0 right-0 h-1 sm:h-2 bg-muted rounded-full" />
              
              {/* Pointages sur la timeline */}
              {guichetiere.detailsParCreneau.map((detail, idx) => {
                const debutPercent = (timeToMinutes(detail.debut) / totalDuration) * 100;
                const finPercent = (timeToMinutes(detail.fin) / totalDuration) * 100;
                const centerPercent = debutPercent + ((finPercent - debutPercent) / 2);
                
                // Sur mobile, afficher seulement si c'est le créneau sélectionné ou s'il a été pointé
                if (isMobile && detail.status !== 'pointed' && idx !== selectedCreneau) return null;

                            return (
                  <div key={idx} className="absolute top-2" style={{ left: `${centerPercent}%` }}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center">
                            <motion.div 
                              whileHover={{ scale: 1.15 }}
                              className={`w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center 
                                ${detail.status === 'pointed' ? 'bg-success text-success-foreground' : 
                                  detail.status === 'active' ? 'bg-warning text-warning-foreground animate-pulse' : 
                                  detail.status === 'missed' ? 'bg-destructive/10 border-2 border-destructive/30 text-destructive' : 
                                  'bg-muted border-2 border-border text-muted-foreground'}`}
                            >
                              {detail.status === 'pointed' ? (
                                <CheckCircle className="h-3 w-3 sm:h-5 sm:w-5" />
                              ) : detail.status === 'active' ? (
                                <Clock className="h-3 w-3 sm:h-5 sm:w-5" />
                              ) : detail.status === 'missed' ? (
                                <XCircle className="h-3 w-3 sm:h-5 sm:w-5" />
                              ) : (
                                <span className="text-xs  font-semibold">{idx + 1}</span>
                              )}
                            </motion.div>
                            {detail.heurePointage && (
                              <span className="text-xs  bg-card px-1 mt-0.5 rounded font-medium">
                                {detail.heurePointage}
                                        </span>
                                    )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side={isMobile ? "bottom" : "top"} sideOffset={5}>
                          <div className="text-xs sm:text-sm">
                            <p className="font-semibold">Créneau {idx + 1}: {detail.debut} - {detail.fin}</p>
                            {detail.heurePointage ? (
                              <p className="text-xs  text-success flex items-center">
                                <CheckCircle className="h-3 w-3 mr-1" /> 
                                Pointé à {detail.heurePointage}
                              </p>
                            ) : detail.status === 'active' ? (
                              <p className="text-xs  text-warning-muted-foreground">En attente de pointage</p>
                            ) : detail.status === 'missed' ? (
                              <p className="text-xs  text-destructive">Pointage manqué</p>
                            ) : (
                              <p className="text-xs  text-muted-foreground">À venir</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                            );
                        })}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
  
  const renderCreneauView = () => {
    // Si aucun créneau n'est sélectionné, utilisez le créneau actif ou le premier
    const creneauToShow = selectedCreneau !== null ? selectedCreneau : 
                          currentCreneauIndex !== -1 ? currentCreneauIndex : 0;
    
    // Filtrer les guichetières par créneau sélectionné
    const guichetieresDuCreneau = guichetieresData.map(g => {
      const detailCreneau = g.detailsParCreneau[creneauToShow];
      return {
        ...g,
        statusCreneau: detailCreneau.status,
        heurePointage: detailCreneau.heurePointage
      };
    });
    
    // Trier: d'abord les pointés, puis ceux en attente, puis les absents
    const sortedGuichetieres = [...guichetieresDuCreneau].sort((a, b) => {
      const orderMap = { pointed: 1, active: 2, missed: 3, upcoming: 4 };
      return orderMap[a.statusCreneau] - orderMap[b.statusCreneau];
    });
    
    return (
      <div className="w-full pt-2">
        {/* Sélecteur de créneau - scrollable sur mobile */}
        <div className="flex mb-4 overflow-x-auto pb-2 hide-scrollbar">
          {creneaux.map((creneau, idx) => (
            <Button
              key={idx}
              variant={creneauToShow === idx ? "default" : "outline"}
              size={isMobile ? "xs" : "sm"}
              className={`mr-2 flex-shrink-0 text-xs  ${
                idx === currentCreneauIndex ? "border-warning" : ""
              }`}
              onClick={() => setSelectedCreneau(idx)}
            >
              {idx + 1}: {isMobile ? `${creneau.debut.split(':')[0]}h` : creneau.debut}-{isMobile ? `${creneau.fin.split(':')[0]}h` : creneau.fin}
              {idx === currentCreneauIndex && (
                <span className="ml-1 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-warning rounded-full animate-pulse"></span>
              )}
            </Button>
          ))}
        </div>
        
        {/* Résumé du créneau */}
        <div className="bg-muted/40 rounded-lg p-2 sm:p-3 mb-3 sm:mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-xs sm:text-sm">
              Créneau {creneauToShow + 1}: {creneaux[creneauToShow]?.debut} - {creneaux[creneauToShow]?.fin}
              {creneauToShow === currentCreneauIndex && (
                <span className="ml-2 text-warning-muted-foreground text-xs ">(Actif)</span>
              )}
            </h3>
            <div className="text-xs  text-muted-foreground">
              {sortedGuichetieres.filter(g => g.statusCreneau === 'pointed').length}/{sortedGuichetieres.length} pointés
            </div>
          </div>
          
          <div className="h-1.5 sm:h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-success"
              style={{ 
                width: `${sortedGuichetieres.length > 0 ? 
                  (sortedGuichetieres.filter(g => g.statusCreneau === 'pointed').length / sortedGuichetieres.length) * 100 : 0}%` 
              }}
            />
          </div>
        </div>
        
        {/* Grille des guichetières - adaptative selon la taille d'écran */}
        <div className={`grid ${
          isMobile ? 'grid-cols-2 gap-2' : 
          isTablet ? 'grid-cols-3 gap-3' : 
          'grid-cols-4 lg:grid-cols-5 gap-3'
        }`}>
          {sortedGuichetieres.map((guichetiere) => (
            <motion.div
              key={guichetiere.matricule}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className={`relative p-2 sm:p-3 rounded-lg shadow-sm border-2 text-center
                ${guichetiere.statusCreneau === 'pointed' ? 'bg-success-muted dark:bg-success/20 border-success/30 dark:border-success' : 
                  guichetiere.statusCreneau === 'active' ? 'bg-warning-muted dark:bg-warning/20 border-warning/30 dark:border-warning' :
                  guichetiere.statusCreneau === 'missed' ? 'bg-destructive/10 dark:bg-destructive/20 border-destructive/30 dark:border-destructive' :
                  'bg-muted/50 border-border'}`}
            >
              <div className={`mx-auto w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-base sm:text-lg font-medium mb-1 sm:mb-2 ${guichetiere.avatarColor}`}>
                {guichetiere.initials}
              </div>
              
              <p className="font-medium text-xs sm:text-sm truncate">{guichetiere.prenom} {guichetiere.nom}</p>
              
              {guichetiere.statusCreneau === 'pointed' ? (
                <div className="mt-1 text-xs  text-success-muted-foreground dark:text-success flex items-center justify-center">
                  <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" /> 
                  {guichetiere.heurePointage}
                </div>
              ) : guichetiere.statusCreneau === 'active' ? (
                <div className="mt-1 text-xs  text-warning-muted-foreground dark:text-warning flex items-center justify-center">
                  <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 animate-pulse" /> 
                  En attente
                </div>
              ) : guichetiere.statusCreneau === 'missed' ? (
                <div className="mt-1 text-xs  text-destructive dark:text-destructive flex items-center justify-center">
                  <XCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" /> 
                  Absence
                </div>
              ) : (
                <div className="mt-1 text-xs  text-foreground/80 dark:text-muted-foreground flex items-center justify-center">
                  À venir
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base sm:text-lg md:text-xl text-primary flex items-center">
            <Clock className="mr-2 h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" /> 
            <span className="hidden xs:inline">Chronologie des</span> Pointages du Jour
          </CardTitle>
          <div className="flex items-center gap-1">
            {!isMobile && (
              <Button variant="ghost" size={isMobile ? "xs" : "sm"} onClick={() => setShowFilters(!showFilters)}>
                <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                {!isMobile && (showFilters ? "Masquer" : "Filtres")}
              </Button>
            )}
            <div className="flex items-center text-xs  text-muted-foreground">
              {isMobile ? <Smartphone className="h-3 w-3 sm:h-4 sm:w-4" /> : <Laptop className="h-3 w-3 sm:h-4 sm:w-4" />}
            </div>
          </div>
        </div>
      </CardHeader>
      
      {/* Onglets et filtres - masqués sur mobile */}
      <CardContent className="pt-2">
        <AnimatePresence>
          {showFilters && !isMobile && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-3 sm:mb-4 overflow-hidden"
            >
              <div className="bg-muted/40 rounded-lg p-2 sm:p-3">
                <Tabs defaultValue="time" className="w-full">
                  <TabsList className="grid grid-cols-2 mb-3 sm:mb-4">
                    <TabsTrigger value="time" className="text-xs ">
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      Créneaux
                    </TabsTrigger>
                    <TabsTrigger value="status" className="text-xs ">
                      <BarChart className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      Statuts
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="time">
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      <Button variant="outline" size={isMobile ? "xs" : "sm"} className="text-xs ">Tous</Button>
                      {creneaux.map((creneau, idx) => (
                        <Button key={idx} variant="outline" size={isMobile ? "xs" : "sm"} className="text-xs ">
                          C{idx + 1}
                        </Button>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="status">
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      <Button variant="outline" size={isMobile ? "xs" : "sm"} className="text-xs ">Tous</Button>
                      <Button variant="outline" size={isMobile ? "xs" : "sm"} className="text-xs  text-success-muted-foreground border-success/30">
                        <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                        Pointé
                      </Button>
                      <Button variant="outline" size={isMobile ? "xs" : "sm"} className="text-xs  text-warning-muted-foreground border-warning/30">
                        <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                        En attente
                      </Button>
                      <Button variant="outline" size={isMobile ? "xs" : "sm"} className="text-xs  text-destructive border-destructive/30">
                        <XCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                        Absence
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Sélection de vue - simplifiée pour mobile */}
        <div className="mb-3 sm:mb-4">
          <div className="grid grid-cols-2 p-1 bg-muted rounded-lg">
            <Button 
              variant={viewMode === 'timeline' ? "default" : "ghost"} 
              className="rounded-lg text-xs  py-1.5 px-2 sm:py-2 sm:px-3"
              onClick={() => setViewMode('timeline')}
            >
              <BarChart className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {!isMobile && "Chronologie"}
            </Button>
            <Button 
              variant={viewMode === 'creneau' ? "default" : "ghost"} 
              className="rounded-lg text-xs  py-1.5 px-2 sm:py-2 sm:px-3"
              onClick={() => setViewMode('creneau')}
            >
              <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              {!isMobile && "Par créneau"}
            </Button>
          </div>
        </div>
        
        {/* Contenu principal selon la vue */}
        <AnimatePresence mode="wait">
          <motion.div 
            key={viewMode}
            initial={{ opacity: 0, x: viewMode === 'timeline' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: viewMode === 'timeline' ? 20 : -20 }}
            transition={{ duration: 0.3 }}
          >
            {viewMode === 'timeline' ? renderTimelineView() : renderCreneauView()}
          </motion.div>
        </AnimatePresence>
        
        {/* Légende - adaptée pour mobile */}
        <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-3 mt-3 sm:mt-4 text-xs  text-muted-foreground">
          <div className="flex items-center">
            <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 bg-success rounded-full mr-1"></div>
            <span>Pointé</span>
          </div>
          <div className="flex items-center">
            <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 bg-warning animate-pulse rounded-full mr-1"></div>
            <span>En attente</span>
          </div>
          <div className="flex items-center">
            <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 bg-destructive/60 rounded-full mr-1"></div>
            <span>Absence</span>
          </div>
          <div className="flex items-center">
            <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 bg-muted-foreground/40 rounded-full mr-1"></div>
            <span>À venir</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PointageTimeline;
