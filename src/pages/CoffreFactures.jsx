import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Upload, Search, Filter, Download, Send, Eye, Edit2, Trash2, 
  FileText, AlertCircle, CheckCircle, Clock, Loader2, Settings 
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import PageHeader from '@/components/ui/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function CoffreFactures() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatut, setFilterStatut] = useState('tous');
  const [filterCategorie, setFilterCategorie] = useState('toutes');
  const [filterFournisseur, setFilterFournisseur] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [montantMin, setMontantMin] = useState('');
  const [montantMax, setMontantMax] = useState('');
  const [selectedFactures, setSelectedFactures] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: factures = [], isLoading } = useQuery({
    queryKey: ['factures'],
    queryFn: () => base44.entities.Facture.list('-created_date')
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const deleteFactureMutation = useMutation({
    mutationFn: (id) => base44.entities.Facture.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factures'] });
      toast.success('Facture supprimée');
    }
  });

  // Recherche plein texte + filtres
  const facturesFiltrees = useMemo(() => {
    let result = [...factures];

    // Recherche plein texte (fournisseur, description, tags, commentaires, texte_indexe)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(f => 
        (f.fournisseur?.toLowerCase().includes(query)) ||
        (f.description?.toLowerCase().includes(query)) ||
        (f.categories?.some(c => c.toLowerCase().includes(query))) ||
        (f.commentaires?.toLowerCase().includes(query)) ||
        (f.texte_indexe?.toLowerCase().includes(query))
      );
    }

    // Filtre statut
    if (filterStatut !== 'tous') {
      result = result.filter(f => f.statut === filterStatut);
    }

    // Filtre catégorie
    if (filterCategorie !== 'toutes') {
      result = result.filter(f => f.categories?.includes(filterCategorie));
    }

    // Filtre fournisseur
    if (filterFournisseur) {
      const query = filterFournisseur.toLowerCase();
      result = result.filter(f => f.fournisseur?.toLowerCase().includes(query));
    }

    // Filtre date
    if (dateDebut) {
      result = result.filter(f => !f.date_facture || f.date_facture >= dateDebut);
    }
    if (dateFin) {
      result = result.filter(f => !f.date_facture || f.date_facture <= dateFin);
    }

    // Filtre montant
    if (montantMin) {
      result = result.filter(f => (f.montant_ttc || 0) >= parseFloat(montantMin));
    }
    if (montantMax) {
      result = result.filter(f => (f.montant_ttc || 0) <= parseFloat(montantMax));
    }

    return result;
  }, [factures, searchQuery, filterStatut, filterCategorie, filterFournisseur, dateDebut, dateFin, montantMin, montantMax]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Upload du fichier
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Nom normalisé
      const now = new Date();
      const dateStr = format(now, 'yyyy-MM-dd');
      const fileName = `${dateStr}__${file.name}`;

      // Extraction IA + OCR
      toast.info('Analyse de la facture en cours...');
      const extractionResult = await base44.functions.invoke('extractInvoiceData', { file_url });

      if (extractionResult.data.success) {
        const extractedData = extractionResult.data.data;

        // Créer la facture
        await base44.entities.Facture.create({
          file_url: file_url,
          file_name: fileName,
          uploaded_by: currentUser?.email,
          ...extractedData
        });

        queryClient.invalidateQueries({ queryKey: ['factures'] });
        
        if (extractedData.statut === 'a_verifier') {
          toast.warning('Facture uploadée - À vérifier (confiance IA faible)');
        } else {
          toast.success('Facture uploadée et analysée avec succès');
        }
      } else {
        // Créer quand même la facture avec statut "à vérifier"
        await base44.entities.Facture.create({
          file_url: file_url,
          file_name: fileName,
          uploaded_by: currentUser?.email,
          statut: 'a_verifier'
        });

        queryClient.invalidateQueries({ queryKey: ['factures'] });
        toast.warning('Facture uploadée - Extraction IA échouée, veuillez compléter manuellement');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erreur lors de l\'upload: ' + error.message);
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset input
    }
  };

  const handleSendSelected = async () => {
    if (selectedFactures.length === 0) {
      toast.error('Aucune facture sélectionnée');
      return;
    }

    // Vérifier si des factures "à vérifier" sont sélectionnées
    const facturesToVerify = factures.filter(f => 
      selectedFactures.includes(f.id) && f.statut === 'a_verifier'
    );

    if (facturesToVerify.length > 0) {
      if (!confirm(`${facturesToVerify.length} facture(s) sont marquées "À vérifier". Continuer l'envoi ?`)) {
        return;
      }
    }

    const destinataire = prompt('Email du destinataire (comptabilité):');
    if (!destinataire) return;

    setSending(true);
    try {
      const result = await base44.functions.invoke('sendInvoicesToAccountant', {
        factureIds: selectedFactures,
        destinataire: destinataire,
        methode: 'manuel'
      });

      if (result.data.success) {
        toast.success(result.data.message);
        setSelectedFactures([]);
        queryClient.invalidateQueries({ queryKey: ['factures'] });
      } else {
        toast.error(result.data.error || 'Erreur lors de l\'envoi');
      }
    } catch (error) {
      console.error('Send error:', error);
      toast.error('Erreur: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  const toggleSelection = (id) => {
    setSelectedFactures(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const getStatutBadge = (statut) => {
    const config = {
      'non_envoyee': { label: 'Non envoyée', className: 'bg-gray-100 text-gray-700 border-gray-300' },
      'a_verifier': { label: 'À vérifier', className: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
      'envoyee': { label: 'Envoyée', className: 'bg-green-100 text-green-700 border-green-300' }
    };
    const { label, className } = config[statut] || config['non_envoyee'];
    return <Badge className={className} variant="outline">{label}</Badge>;
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Coffre à Factures"
        subtitle="Gestion des factures fournisseurs"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Link to={createPageUrl('ParametresCompta')}>
              <Button variant="outline" className="border-gray-300">
                <Settings className="w-4 h-4 mr-2" />
                Paramètres
              </Button>
            </Link>
            <Button
              onClick={handleSendSelected}
              disabled={selectedFactures.length === 0 || sending}
              variant="outline"
              className="border-gray-300"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Envoyer ({selectedFactures.length})
            </Button>
            <label htmlFor="upload-facture">
              <Button asChild disabled={uploading} className="bg-orange-600 hover:bg-orange-700 cursor-pointer">
                <span>
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Upload...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Uploader une facture
                    </>
                  )}
                </span>
              </Button>
              <input
                id="upload-facture"
                type="file"
                accept="application/pdf,image/*"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        }
      />

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Filtres & Recherche</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Recherche plein texte */}
          <div className="lg:col-span-2">
            <Input
              placeholder="Rechercher (fournisseur, description, contenu...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-gray-300"
              icon={<Search className="w-4 h-4" />}
            />
          </div>

          {/* Filtre statut */}
          <Select value={filterStatut} onValueChange={setFilterStatut}>
            <SelectTrigger className="border-gray-300">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous les statuts</SelectItem>
              <SelectItem value="non_envoyee">Non envoyée</SelectItem>
              <SelectItem value="a_verifier">À vérifier</SelectItem>
              <SelectItem value="envoyee">Envoyée</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtre catégorie */}
          <Select value={filterCategorie} onValueChange={setFilterCategorie}>
            <SelectTrigger className="border-gray-300">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="toutes">Toutes catégories</SelectItem>
              <SelectItem value="Produits alimentaires">Produits alimentaires</SelectItem>
              <SelectItem value="Carburant">Carburant</SelectItem>
              <SelectItem value="Fournitures de bureau">Fournitures de bureau</SelectItem>
              <SelectItem value="Garagiste / Entretien véhicule">Garagiste / Entretien véhicule</SelectItem>
              <SelectItem value="Matériel / Équipement">Matériel / Équipement</SelectItem>
              <SelectItem value="Emballages">Emballages</SelectItem>
              <SelectItem value="Télécom / Internet">Télécom / Internet</SelectItem>
              <SelectItem value="Énergie">Énergie</SelectItem>
              <SelectItem value="Divers">Divers</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtre fournisseur */}
          <Input
            placeholder="Fournisseur"
            value={filterFournisseur}
            onChange={(e) => setFilterFournisseur(e.target.value)}
            className="border-gray-300"
          />

          {/* Filtre période */}
          <Input
            type="date"
            placeholder="Date début"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="border-gray-300"
          />
          <Input
            type="date"
            placeholder="Date fin"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="border-gray-300"
          />

          {/* Filtre montant */}
          <Input
            type="number"
            placeholder="Montant min"
            value={montantMin}
            onChange={(e) => setMontantMin(e.target.value)}
            className="border-gray-300"
          />
          <Input
            type="number"
            placeholder="Montant max"
            value={montantMax}
            onChange={(e) => setMontantMax(e.target.value)}
            className="border-gray-300"
          />
        </div>
      </div>

      {/* Tableau des factures */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3 text-left">
                  <Checkbox 
                    checked={selectedFactures.length === facturesFiltrees.length && facturesFiltrees.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedFactures(facturesFiltrees.map(f => f.id));
                      } else {
                        setSelectedFactures([]);
                      }
                    }}
                  />
                </th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Fournisseur</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Description</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Catégories</th>
                <th className="p-3 text-right text-sm font-semibold text-gray-700">HT</th>
                <th className="p-3 text-right text-sm font-semibold text-gray-700">TTC</th>
                <th className="p-3 text-center text-sm font-semibold text-gray-700">Statut</th>
                <th className="p-3 text-center text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {facturesFiltrees.map((facture) => (
                <tr key={facture.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-3">
                    <Checkbox 
                      checked={selectedFactures.includes(facture.id)}
                      onCheckedChange={() => toggleSelection(facture.id)}
                    />
                  </td>
                  <td className="p-3 text-sm text-gray-900">
                    {facture.date_facture ? format(parseISO(facture.date_facture), 'dd/MM/yyyy') : '-'}
                  </td>
                  <td className="p-3 text-sm font-medium text-gray-900">
                    {facture.fournisseur || '-'}
                  </td>
                  <td className="p-3 text-sm text-gray-700">
                    {facture.description || '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {facture.categories?.slice(0, 2).map((cat, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          {cat}
                        </Badge>
                      ))}
                      {facture.categories?.length > 2 && (
                        <Badge variant="outline" className="text-xs">+{facture.categories.length - 2}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-sm text-right text-gray-900">
                    {facture.montant_ht ? `${facture.montant_ht.toFixed(2)} €` : '-'}
                  </td>
                  <td className="p-3 text-sm text-right font-semibold text-gray-900">
                    {facture.montant_ttc ? `${facture.montant_ttc.toFixed(2)} €` : '-'}
                  </td>
                  <td className="p-3 text-center">
                    {getStatutBadge(facture.statut)}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2 justify-center">
                      <Link to={createPageUrl('DetailFacture') + `?id=${facture.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <a href={facture.file_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">
                          <Download className="w-4 h-4" />
                        </Button>
                      </a>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          if (confirm('Supprimer cette facture ?')) {
                            deleteFactureMutation.mutate(facture.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {facturesFiltrees.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>Aucune facture trouvée</p>
          </div>
        )}
      </div>
    </div>
  );
}