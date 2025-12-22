import Home from './pages/Home';
import MiseEnPlace from './pages/MiseEnPlace';
import TravailDuJour from './pages/TravailDuJour';
import Temperatures from './pages/Temperatures';
import Recettes from './pages/Recettes';
import Historique from './pages/Historique';
import Equipe from './pages/Equipe';
import Pertes from './pages/Pertes';
import Stocks from './pages/Stocks';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "MiseEnPlace": MiseEnPlace,
    "TravailDuJour": TravailDuJour,
    "Temperatures": Temperatures,
    "Recettes": Recettes,
    "Historique": Historique,
    "Equipe": Equipe,
    "Pertes": Pertes,
    "Stocks": Stocks,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};