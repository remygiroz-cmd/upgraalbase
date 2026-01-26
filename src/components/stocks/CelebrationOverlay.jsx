import React, { useEffect } from 'react';
import { Trophy, Rocket, Star, CheckCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';

const QUOTES = [
  "Bravo Chef, mission accomplie !",
  "Liste terminée ! Excellent travail !",
  "Tous les produits sont dans le caddie !",
  "Parfait ! Rien n'a été oublié !",
  "Mission réussie, Chef !"
];

export default function CelebrationOverlay({ onComplete }) {
  useEffect(() => {
    // Confetti explosion
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#f97316', '#fb923c', '#fdba74']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#f97316', '#fb923c', '#fdba74']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    const timer = setTimeout(() => {
      onComplete();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.5, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.6 }}
        className="bg-white rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl"
      >
        <motion.div
          animate={{ 
            rotate: [0, 10, -10, 10, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ 
            duration: 0.5,
            repeat: Infinity,
            repeatDelay: 1
          }}
        >
          <Trophy className="w-24 h-24 mx-auto text-orange-500 mb-4" />
        </motion.div>

        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          🎉 Mission Accomplie !
        </h2>
        
        <p className="text-lg text-gray-600 mb-6">
          {randomQuote}
        </p>

        <div className="flex items-center justify-center gap-2 text-green-600">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold">Tous les articles sont pointés</span>
        </div>
      </motion.div>
    </motion.div>
  );
}