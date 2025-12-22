import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Mail, Phone, MapPin, Briefcase, CreditCard, Pencil, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const CONTRACT_LABELS = {
  cdi: 'CDI',
  cdd: 'CDD',
  extra: 'Extra',
  apprenti: 'Apprenti',
  stage: 'Stage'
};

export default function EmployeeDetailModal({ employee, onClose, onEdit }) {
  if (!employee) return null;

  const InfoRow = ({ icon: Icon, label, value }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-3 py-2">
        <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-sm">{value}</p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            {employee.photo_url ? (
              <img
                src={employee.photo_url}
                alt={`${employee.first_name} ${employee.last_name}`}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center">
                <User className="w-8 h-8 text-slate-400" />
              </div>
            )}
            <div>
              <DialogTitle>{employee.first_name} {employee.last_name}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="border-indigo-600/50 text-indigo-400">
                  {CONTRACT_LABELS[employee.contract_type] || employee.contract_type}
                </Badge>
                {!employee.is_active && (
                  <Badge variant="outline" className="border-red-600/50 text-red-400">
                    Inactif
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-4">
          <TabsList className="bg-slate-700">
            <TabsTrigger value="info">Informations</TabsTrigger>
            <TabsTrigger value="contract">Contrat</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-700/30 rounded-xl">
                <h3 className="text-sm font-semibold text-slate-400 mb-3">Contact</h3>
                <InfoRow icon={Mail} label="Email" value={employee.email} />
                <InfoRow icon={Phone} label="Téléphone" value={employee.phone} />
                <InfoRow icon={MapPin} label="Adresse" value={employee.address} />
              </div>
              
              <div className="p-4 bg-slate-700/30 rounded-xl">
                <h3 className="text-sm font-semibold text-slate-400 mb-3">Identité</h3>
                <InfoRow 
                  icon={User} 
                  label="Date de naissance" 
                  value={employee.birth_date ? format(parseISO(employee.birth_date), "d MMMM yyyy", { locale: fr }) : null} 
                />
                <InfoRow icon={User} label="Lieu de naissance" value={employee.birth_place} />
                <InfoRow icon={User} label="Nationalité" value={employee.nationality} />
              </div>
            </div>

            {employee.notes && (
              <div className="p-4 bg-slate-700/30 rounded-xl">
                <h3 className="text-sm font-semibold text-slate-400 mb-2">Notes internes</h3>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{employee.notes}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="contract" className="mt-4">
            <div className="p-4 bg-slate-700/30 rounded-xl space-y-3">
              <InfoRow icon={Briefcase} label="Poste" value={employee.position} />
              <InfoRow icon={Briefcase} label="Équipe" value={employee.team} />
              <InfoRow 
                icon={Briefcase} 
                label="Date d'entrée" 
                value={employee.start_date ? format(parseISO(employee.start_date), "d MMMM yyyy", { locale: fr }) : null} 
              />
              <InfoRow 
                icon={Briefcase} 
                label="Fin période d'essai" 
                value={employee.trial_end_date ? format(parseISO(employee.trial_end_date), "d MMMM yyyy", { locale: fr }) : null} 
              />
              <InfoRow icon={Briefcase} label="Heures/semaine" value={employee.contract_hours ? `${employee.contract_hours}h` : null} />
              <InfoRow icon={CreditCard} label="Taux horaire" value={employee.hourly_rate ? `${employee.hourly_rate.toFixed(2)} €` : null} />
            </div>
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            {employee.documents && employee.documents.length > 0 ? (
              <div className="space-y-2">
                {employee.documents.map((doc, index) => (
                  <a
                    key={index}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium">{doc.name}</p>
                      {doc.category && (
                        <p className="text-xs text-slate-500">{doc.category}</p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-500 py-8">Aucun document</p>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <Button
            onClick={onEdit}
            variant="outline"
            className="border-slate-600 text-slate-900 hover:text-slate-100 hover:bg-slate-700"
          >
            <Pencil className="w-4 h-4 mr-2" />
            Modifier
          </Button>
          <Button onClick={onClose} className="bg-slate-600 hover:bg-slate-500 text-slate-100">
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}