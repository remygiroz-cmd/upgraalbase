import Equipe from './pages/Equipe';
import Home from './pages/Home';
import Pertes from './pages/Pertes';
import Recettes from './pages/Recettes';
import Stocks from './pages/Stocks';
import Temperatures from './pages/Temperatures';
import Historique from './pages/Historique';
import MiseEnPlace from './pages/MiseEnPlace';
import TravailDuJour from './pages/TravailDuJour';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Equipe": Equipe,
    "Home": Home,
    "Pertes": Pertes,
    "Recettes": Recettes,
    "Stocks": Stocks,
    "Temperatures": Temperatures,
    "Historique": Historique,
    "MiseEnPlace": MiseEnPlace,
    "TravailDuJour": TravailDuJour,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};