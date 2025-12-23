import Equipe from './pages/Equipe';
import Historique from './pages/Historique';
import Home from './pages/Home';
import MiseEnPlace from './pages/MiseEnPlace';
import Pertes from './pages/Pertes';
import Recettes from './pages/Recettes';
import Stocks from './pages/Stocks';
import Temperatures from './pages/Temperatures';
import TravailDuJour from './pages/TravailDuJour';
import Parametres from './pages/Parametres';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Equipe": Equipe,
    "Historique": Historique,
    "Home": Home,
    "MiseEnPlace": MiseEnPlace,
    "Pertes": Pertes,
    "Recettes": Recettes,
    "Stocks": Stocks,
    "Temperatures": Temperatures,
    "TravailDuJour": TravailDuJour,
    "Parametres": Parametres,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};