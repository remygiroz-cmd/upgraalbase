import Equipe from './pages/Equipe';
import Historique from './pages/Historique';
import Home from './pages/Home';
import Pertes from './pages/Pertes';
import Stocks from './pages/Stocks';
import Temperatures from './pages/Temperatures';
import TravailDuJour from './pages/TravailDuJour';
import MiseEnPlace from './pages/MiseEnPlace';
import Recettes from './pages/Recettes';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Equipe": Equipe,
    "Historique": Historique,
    "Home": Home,
    "Pertes": Pertes,
    "Stocks": Stocks,
    "Temperatures": Temperatures,
    "TravailDuJour": TravailDuJour,
    "MiseEnPlace": MiseEnPlace,
    "Recettes": Recettes,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};