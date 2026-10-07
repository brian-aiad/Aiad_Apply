from aiadapply_v2.documents.model import parse_resume_docx
from aiadapply_v2.evidence.candidate_profile import add_candidate_profile_evidence
from aiadapply_v2.evidence.loaders import build_evidence_graph
from aiadapply_v2.planning.stretch_lab import build_stretch_lab
from aiadapply_v2.schemas import CandidateProfile, JobKeyword, KeywordKind, TargetRoleProfile
from aiadapply_v2.semantic.matcher import build_transferability_map


class SkillsBiasedEncoder:
    def similarities(self, query, passages):
        # Deliberately favor broad skills/profile text to verify source selection.
        return [0.99 if 'Candidate-confirmed' in item or 'Technical Support:' in item else 0.8 for item in passages]


def intelligence(terms, profile=None):
    keywords = [JobKeyword(term=term, normalized=term.casefold(), kind=KeywordKind.action,
                           hiring_importance=35, placement_utility=35) for term in terms]
    target = TargetRoleProfile(title='Support Engineer', normalized_role_family='support',
                               professional_identity='Technical Support Engineer')
    graph = build_evidence_graph(parse_resume_docx('data/resumes/Brian_Aiad_BASE.docx'), keywords)
    add_candidate_profile_evidence(graph, profile)
    mapping = build_transferability_map(target, keywords, graph, SkillsBiasedEncoder())
    return target, keywords, mapping


def test_ci_cd_skills_do_not_establish_employer_continuous_integration():
    from aiadapply_v2.planning.priorities import paragraph_priorities
    from aiadapply_v2.semantic.matcher import _direct_match, _strength

    base = parse_resume_docx('data/resumes/Brian_Aiad_BASE.docx')
    keyword = JobKeyword(term='Continuous Integration', normalized='continuous integration',
                         kind=KeywordKind.environment, hiring_importance=50, placement_utility=50)
    graph = build_evidence_graph(base, [keyword])
    employer = next(e for e in graph.evidence if e.paragraph_id == 'experience.original_insurance.bullet.5')
    skills = next(e for e in graph.evidence if e.paragraph_id == 'skills.cloud_systems')
    assert not _direct_match(keyword.term, employer)
    assert _direct_match(keyword.term, skills)
    assert _strength(keyword.term, keyword.kind, False, False, 0.99).value == 'unsupported'
    profile = TargetRoleProfile(title='IT Systems Engineer', normalized_role_family='support',
                                professional_identity='Application Support Engineer')
    mapping = build_transferability_map(profile, [keyword], graph, SkillsBiasedEncoder())
    assert mapping.matches[0].evidence_id == skills.evidence_id
    assert not any('Continuous Integration' in row['missing_supported_terms']
                   for row in paragraph_priorities(base, [keyword], graph, mapping)
                   if '.bullet.' in row['paragraph_id'])


def test_ordinary_skills_use_concrete_work_and_do_not_require_stretch_confirmation():
    terms = ['critical thinking', 'communication skills', 'fast-paced environment',
             'case management', 'automation']
    target, keywords, mapping = intelligence(terms)
    for match in mapping.matches:
        assert match.strength.value == 'strongly_transferable'
        assert match.evidence_id.startswith(('evidence.experience.', 'evidence.projects.'))
        assert 'no extra confirmation' in match.reasoning
    assert 'support tickets' in next(m.source_text for m in mapping.matches if m.target_term == 'case management') or 'incident documentation' in next(m.source_text for m in mapping.matches if m.target_term == 'case management')
    lab = build_stretch_lab(target, keywords, mapping)
    assert not lab.transferable_opportunities
    assert not lab.gaps


def test_general_confirmation_does_not_displace_real_transferable_work():
    profile = CandidateProfile(candidate_name="Brian Aiad", confirmed_exposure=['critical thinking', 'case management'])
    _, _, mapping = intelligence(['critical thinking', 'case management'], profile)
    assert all(match.evidence_id.startswith('evidence.experience.') for match in mapping.matches)


def test_ai_and_crud_are_not_inferred_from_ordinary_automation_or_high_similarity():
    target, keywords, mapping = intelligence(['AI', 'CRUD'])
    assert all(match.strength.value == 'unsupported' for match in mapping.matches)
    lab = build_stretch_lab(target, keywords, mapping)
    assert 'create, read, update, and delete' in next(g for g in lab.gaps if g.target_term == 'CRUD').proof_needed[0]
    assert 'ordinary automation is not proof' in next(g for g in lab.gaps if g.target_term == 'AI').proof_needed[1]


def test_confirmed_ai_exposure_keeps_candidate_profile_scope():
    profile = CandidateProfile(candidate_name="Brian Aiad", confirmed_exposure=['AI'])
    _, _, mapping = intelligence(['AI'], profile)
    assert mapping.matches[0].strength.value == 'direct'
    assert mapping.matches[0].evidence_id == 'evidence.candidate_profile.confirmed'


def _priorities_with_profile(terms, profile):
    from aiadapply_v2.planning.priorities import paragraph_priorities

    target, keywords, _ = intelligence(terms, profile)
    document = parse_resume_docx('data/resumes/Brian_Aiad_BASE.docx')
    graph = build_evidence_graph(document, keywords)
    add_candidate_profile_evidence(graph, profile)
    matches = build_transferability_map(target, keywords, graph, SkillsBiasedEncoder())
    return paragraph_priorities(document, keywords, graph, matches)


def test_general_knowledge_base_exposure_does_not_authorize_employer_claim():
    profile = CandidateProfile(candidate_name='Brian Aiad', confirmed_exposure=['knowledge base'])
    rows = _priorities_with_profile(['knowledge base'], profile)
    assert all('knowledge base' not in row['missing_supported_terms'] for row in rows)


def test_specific_knowledge_base_confirmation_is_limited_to_its_employer():
    from aiadapply_v2.schemas import CandidateEvidenceItem

    profile = CandidateProfile(candidate_name='Brian Aiad', confirmed_evidence=[
        CandidateEvidenceItem(term='knowledge base', category='method', scope='source_specific',
                              evidence_reference='experience.csulb', notes='Maintained published troubleshooting articles.'),
    ])
    rows = _priorities_with_profile(['knowledge base'], profile)
    placements = [row['paragraph_id'] for row in rows if 'knowledge base' in row['missing_supported_terms']]
    assert placements
    assert all(pid.startswith('experience.csulb.') for pid in placements)


def test_ordinary_case_management_remains_supported_by_actual_ticket_work():
    profile = CandidateProfile(candidate_name='Brian Aiad', confirmed_exposure=['case management'])
    rows = _priorities_with_profile(['case management'], profile)
    assert any(row['paragraph_id'] == 'experience.original_insurance.bullet.1'
               and 'case management' in row['missing_supported_terms'] for row in rows)


def test_documented_writing_and_enterprise_support_need_no_routine_confirmation():
    from aiadapply_v2.evidence.loaders import supports_automatic_context

    target, keywords, mapping = intelligence(['technical writing', 'enterprise software'])
    writing, enterprise = mapping.matches
    assert writing.evidence_id == 'evidence.experience.csulb.bullet.3'
    assert enterprise.evidence_id.startswith('evidence.experience.original_insurance.')
    assert all(match.strength.value == 'strongly_transferable' for match in mapping.matches)
    assert not build_stretch_lab(target, keywords, mapping).transferable_opportunities
    assert not supports_automatic_context('enterprise software', 'Microsoft 365, Excel, Outlook')
    assert not supports_automatic_context('knowledge base', writing.source_text)
    assert not supports_automatic_context('ERP', enterprise.source_text)
