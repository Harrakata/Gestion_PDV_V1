import React, { useState, useEffect } from 'react';
import { Bell, Clock, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const PointageNotification = ({ 
  show, 
  type = 'reminder', // 'reminder' | 'success' | 'late'
  message,
  onClose,
  autoCloseDelay = 5000,
  action
}) => {
  const [isVisible, setIsVisible] = useState(show);
  
  useEffect(() => {
    setIsVisible(show);
    
    if (show && autoCloseDelay) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onClose) setTimeout(onClose, 300);
      }, autoCloseDelay);
      
      return () => clearTimeout(timer);
    }
  }, [show, autoCloseDelay, onClose]);
  
  const handleClose = () => {
    setIsVisible(false);
    if (onClose) setTimeout(onClose, 300);
  };
  
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-8 w-8 text-success" />;
      case 'late':
        return <Clock className="h-8 w-8 text-destructive" />;
      case 'reminder':
      default:
        return <Bell className="h-8 w-8 text-info" />;
    }
  };
  
  const getBackgroundColor = () => {
    switch (type) {
      case 'success': return 'bg-success-muted dark:bg-success/20';
      case 'late': return 'bg-destructive/10 dark:bg-destructive/20';
      case 'reminder': 
      default: return 'bg-info-muted dark:bg-primary/20';
    }
  };
  
  const getBorderColor = () => {
    switch (type) {
      case 'success': return 'border-l-success';
      case 'late': return 'border-l-destructive';
      case 'reminder': 
      default: return 'border-l-info';
    }
  };
  
  const currentTime = format(new Date(), 'HH:mm', { locale: fr });
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`fixed top-4 right-4 max-w-sm border-l-4 ${getBorderColor()} shadow-lg rounded-md overflow-hidden z-50 ${getBackgroundColor()}`}
        >
          <div className="p-4 flex">
            <div className="flex-shrink-0 mr-3">
              {getIcon()}
            </div>
            <div className="flex-1 pr-8">
              <div className="flex justify-between items-center mb-1">
                <p className="font-medium">
                  {type === 'reminder' ? 'Rappel de pointage' : 
                   type === 'success' ? 'Pointage réussi' : 'Attention retard'}
                </p>
                <span className="text-xs text-muted-foreground">{currentTime}</span>
              </div>
              <p className="text-sm text-foreground/80 dark:text-muted-foreground">
                {message || (
                  type === 'reminder' ? 'N\'oubliez pas de pointer votre entrée/sortie' : 
                  type === 'success' ? 'Votre pointage a bien été enregistré' : 
                  'Attention, vous êtes en retard pour le pointage'
                )}
              </p>
              
              {action && (
                <button 
                  className="mt-2 text-xs font-medium text-info-muted-foreground hover:text-info-muted-foreground dark:text-info dark:hover:text-info"
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              )}
            </div>
            <button 
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground/80 dark:hover:text-muted-foreground"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PointageNotification; 