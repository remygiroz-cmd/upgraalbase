import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, Sparkles, Zap, Trophy, Heart, Star, Flame, Rocket } from 'lucide-react';

const MESSAGES = [
  { text: "🎉 C'est parti pour un service d'enfer !", icon: Flame },
  { text: "✨ La brigade est prête à cartonner !", icon: Sparkles },
  { text: "🚀 En cuisine, tout le monde ! ", icon: Rocket },
  { text: "⭐ Liste créée avec brio !", icon: Star },
  { text: "🏆 Top chef approuve cette liste !", icon: Trophy },
  { text: "💪 Service du tonnerre en approche !", icon: Zap },
  { text: "❤️ Cuisinez avec passion !", icon: Heart },
  { text: "👨‍🍳 La magie opère en cuisine !", icon: ChefHat },
  { text: "🎯 Mission mise en place : réussie !", icon: Trophy },
  { text: "⚡ On va tout déchirer aujourd'hui !", icon: Zap },
  { text: "🌟 Bravo chef, c'est parfait !", icon: Star },
  { text: "🔥 Le feu est allumé, on y va !", icon: Flame },
  { text: "🎊 Que le show commence !", icon: Sparkles },
  { text: "💫 Liste au top, équipe au top !", icon: Sparkles },
  { text: "🎪 Place au spectacle culinaire !", icon: Rocket }
];

export default function SuccessOverlay({ show, onComplete }) {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (show) {
      // Choisir un message aléatoire
      const randomMessage = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      setMessage(randomMessage);
      
      // Auto-fermeture après 3 secondes
      const timer = setTimeout(() => {
        onComplete();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  const Icon = message?.icon || ChefHat;

  return (
    <AnimatePresence>
      {show && message && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-orange-600 via-orange-500 to-orange-700 p-4"
        >
          {/* Particules animées en arrière-plan */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: Math.random() * window.innerWidth,
                  y: window.innerHeight + 50,
                  scale: 0
                }}
                animate={{
                  y: -100,
                  scale: [0, 1, 0],
                  rotate: [0, 360]
                }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  delay: Math.random() * 0.5,
                  repeat: Infinity,
                  repeatDelay: Math.random()
                }}
                className="absolute w-4 h-4 bg-white/30 rounded-full"
              />
            ))}
          </div>

          {/* Message principal */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ 
              scale: 1, 
              rotate: 0,
              y: [0, -20, 0]
            }}
            transition={{
              scale: { type: "spring", stiffness: 200, damping: 15 },
              rotate: { duration: 0.6 },
              y: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
            }}
            className="relative text-center"
          >
            {/* Icône */}
            <motion.div
              animate={{ 
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="mx-auto mb-6 w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
            >
              <Icon className="w-12 h-12 sm:w-16 sm:h-16 text-white drop-shadow-lg" />
            </motion.div>

            {/* Texte */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-3xl sm:text-4xl md:text-6xl font-bold text-white drop-shadow-2xl px-4 leading-tight"
            >
              {message.text}
            </motion.h1>

            {/* Confettis d'étoiles */}
            <div className="absolute -inset-12 pointer-events-none">
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{
                    scale: [0, 1, 1],
                    opacity: [1, 1, 0],
                    x: [0, (Math.cos(i * Math.PI / 4) * 150)],
                    y: [0, (Math.sin(i * Math.PI / 4) * 150)]
                  }}
                  transition={{
                    duration: 1.5,
                    delay: 0.5,
                    ease: "easeOut"
                  }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                  <Star className="w-6 h-6 text-yellow-300 fill-yellow-300" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}